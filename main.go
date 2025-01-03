package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

type Score struct {
	Name      string `json:"name"`
	Score     int    `json:"score"`
	SessionID string `json:"sessionId"`
	Timestamp int64  `json:"timestamp"`
	Nonce     string `json:"nonce"`
	Hash      string `json:"hash"`
}

const (
	appName     = "snake"
	secretKey   = "your-secret-key-here"
	minInterval = 2
	maxTimeDiff = 3
)

var (
	db          *sql.DB
	sessions    = make(map[string]sessionInfo)
	sessionsMap sync.RWMutex
)

type sessionInfo struct {
	StartTime  time.Time
	LastScore  int
	LastSubmit time.Time
}

func initDB() error {
	var err error
	db, err = sql.Open("sqlite3", "./snake.db")
	if err != nil {
		return err
	}

	// 只在表不存在时创建表
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS scores (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			score INTEGER NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func main() {
	// 初始化数据库
	if err := initDB(); err != nil {
		fmt.Printf("Failed to initialize database: %v\n", err)
		return
	}
	defer db.Close()

	r := mux.NewRouter()

	// 添加 SVG MIME 类型
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".svg") {
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		http.FileServer(http.Dir("static")).ServeHTTP(w, r)
	})))

	// 路由处理
	r.HandleFunc("/", handleGame)
	r.HandleFunc("/submit-score", handleSubmitScore)
	r.HandleFunc("/get-scores", handleGetScores)

	port := 8080
	fmt.Printf("Server starting at http://localhost:%d\n", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), r); err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}

func handleGame(w http.ResponseWriter, r *http.Request) {
	sessionID := generateSessionID()
	sessionsMap.Lock()
	sessions[sessionID] = sessionInfo{
		StartTime: time.Now(),
		LastScore: 0,
	}
	sessionsMap.Unlock()

	tmpl := template.Must(template.ParseFiles("templates/game.html"))
	tmpl.Execute(w, map[string]interface{}{
		"SessionID": sessionID,
		"SecretKey": secretKey,
		"AppName":   appName,
	})
}

func handleSubmitScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var score Score
	if err := json.NewDecoder(r.Body).Decode(&score); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 验证会话
	sessionsMap.RLock()
	session, exists := sessions[score.SessionID]
	sessionsMap.RUnlock()
	if !exists {
		http.Error(w, "Invalid session", http.StatusBadRequest)
		return
	}

	// 验证提交间隔
	if time.Since(session.LastSubmit).Seconds() < minInterval {
		http.Error(w, "Please wait before submitting again", http.StatusTooManyRequests)
		return
	}

	// 先查询当前玩家的历史最高分
	var highScore int
	err := db.QueryRow(`SELECT COALESCE(MAX(score), 0) FROM scores WHERE name = ?`, score.Name).Scan(&highScore)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("Database error when querying high score: %v\n", err)
		http.Error(w, "Failed to check high score", http.StatusInternalServerError)
		return
	}

	// 只有当新分数高于历史最高分时才更新数据库
	if score.Score > highScore {
		_, err = db.Exec(`
			INSERT INTO scores (name, score, created_at) 
			VALUES (?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(name) DO UPDATE SET 
				score = excluded.score,
				created_at = CURRENT_TIMESTAMP
		`, score.Name, score.Score)

		if err != nil {
			fmt.Printf("Database error when updating score: %v\n", err)
			http.Error(w, "Failed to save score", http.StatusInternalServerError)
			return
		}
	}

	// 更新会话信息
	sessionsMap.Lock()
	sessions[score.SessionID] = sessionInfo{
		StartTime:  session.StartTime,
		LastScore:  score.Score,
		LastSubmit: time.Now(),
	}
	sessionsMap.Unlock()

	w.WriteHeader(http.StatusOK)
}

func handleGetScores(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT name, score FROM scores 
		ORDER BY score DESC 
		LIMIT 10
	`)
	if err != nil {
		http.Error(w, "Failed to get scores", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	scores := []Score{}
	for rows.Next() {
		var s Score
		if err := rows.Scan(&s.Name, &s.Score); err != nil {
			http.Error(w, "Failed to read scores", http.StatusInternalServerError)
			return
		}
		scores = append(scores, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scores)
}

// 生成会话ID
func generateSessionID() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// 生成分数哈希
func generateScoreHash(sessionID string, score int, timestamp int64, nonce string) string {
	h := hmac.New(sha256.New, []byte(secretKey))
	message := fmt.Sprintf("nonce=%s&score=%d&sessionId=%s&timestamp=%d",
		nonce, score, sessionID, timestamp)
	h.Write([]byte(message))
	return hex.EncodeToString(h.Sum(nil))
}

// 验证分数哈希
func validateScoreHash(score Score) bool {
	expectedHash := generateScoreHash(score.SessionID, score.Score, score.Timestamp, score.Nonce)
	return hmac.Equal([]byte(score.Hash), []byte(expectedHash))
}
