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

// 添加一个用于提交分数的请求结构体
type ScoreSubmission struct {
	Name      string `json:"name"`
	Score     int    `json:"score"`
	SessionID string `json:"sessionId"`
	Timestamp int64  `json:"timestamp"`
	Nonce     string `json:"nonce"`
	Hash      string `json:"hash"`
	Replay    string `json:"replay"`
}

// Score 结构体保持不变，用于数据库存储
type Score struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Score     int       `json:"score"`
	Replay    string    `json:"replay"`
	CreatedAt time.Time `json:"createdAt"`
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
		return fmt.Errorf("failed to open database: %v", err)
	}

	// 设置数据库连接参数
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	// 创建新表（不删除旧表）
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS scores (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			score INTEGER NOT NULL,
			replay TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create table: %v", err)
	}

	return nil
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

	// 使用 ScoreSubmission 来解析请求
	var submission ScoreSubmission
	if err := json.NewDecoder(r.Body).Decode(&submission); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 验证会话
	sessionsMap.RLock()
	session, exists := sessions[submission.SessionID]
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

	// 添加验证
	if !validateScoreHash(submission) {
		http.Error(w, "Invalid score submission", http.StatusBadRequest)
		return
	}

	// 验证时间戳
	now := time.Now().Unix()
	if abs(now-submission.Timestamp) > maxTimeDiff {
		http.Error(w, "Invalid timestamp", http.StatusBadRequest)
		return
	}

	// 先查询当前玩家的历史最高分
	var highScore int
	err := db.QueryRow(`SELECT COALESCE(MAX(score), 0) FROM scores WHERE name = ?`, submission.Name).Scan(&highScore)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("Database error when querying high score: %v\n", err)
		http.Error(w, "Failed to check high score", http.StatusInternalServerError)
		return
	}

	// 只有当新分数高于历史最高分时才更新数据库
	if submission.Score > highScore {
		_, err = db.Exec(`
			INSERT INTO scores (name, score, replay, created_at) 
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(name) DO UPDATE SET 
				score = excluded.score,
				replay = excluded.replay,
				created_at = CURRENT_TIMESTAMP
		`, submission.Name, submission.Score, submission.Replay)

		if err != nil {
			fmt.Printf("Database error when updating score: %v\n", err)
			http.Error(w, "Failed to save score", http.StatusInternalServerError)
			return
		}
	}

	// 更新会话信息
	sessionsMap.Lock()
	sessions[submission.SessionID] = sessionInfo{
		StartTime:  session.StartTime,
		LastScore:  submission.Score,
		LastSubmit: time.Now(),
	}
	sessionsMap.Unlock()

	w.WriteHeader(http.StatusOK)
}

func handleGetScores(w http.ResponseWriter, r *http.Request) {
	// 添加错误日志
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Recovered from panic in handleGetScores: %v\n", r)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
	}()

	// 检查数据库连接
	if err := db.Ping(); err != nil {
		fmt.Printf("Database connection error: %v\n", err)
		http.Error(w, "Database connection error", http.StatusInternalServerError)
		return
	}

	// 修改查询，包含回放数据
	rows, err := db.Query(`
		SELECT name, score, COALESCE(replay, '[]') as replay 
		FROM scores 
		ORDER BY score DESC 
		LIMIT 10
	`)
	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		http.Error(w, "Failed to get scores", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	scores := []Score{}
	for rows.Next() {
		var s Score
		if err := rows.Scan(&s.Name, &s.Score, &s.Replay); err != nil {
			fmt.Printf("Scan error: %v\n", err)
			http.Error(w, "Failed to read scores", http.StatusInternalServerError)
			return
		}
		// 设置默认值
		s.CreatedAt = time.Now()
		scores = append(scores, s)
	}

	if err = rows.Err(); err != nil {
		fmt.Printf("Rows error: %v\n", err)
		http.Error(w, "Error reading scores", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(scores); err != nil {
		fmt.Printf("JSON encode error: %v\n", err)
		http.Error(w, "Error encoding scores", http.StatusInternalServerError)
		return
	}
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

// 修改验证函数以使用 ScoreSubmission
func validateScoreHash(submission ScoreSubmission) bool {
	expectedHash := generateScoreHash(submission.SessionID, submission.Score, submission.Timestamp, submission.Nonce)
	return hmac.Equal([]byte(submission.Hash), []byte(expectedHash))
}

// 添加辅助函数
func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
