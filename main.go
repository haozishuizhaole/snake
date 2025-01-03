package main

import (
	"bytes"
	"compress/gzip"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io/ioutil"
	"net/http"
	"sort"
	"strconv"
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
	CreatedAt time.Time `json:"createdAt"`
}

// 添加提交分数的响应结构体
type ScoreResponse struct {
	IsNewRecord bool `json:"isNewRecord"`
	HighScore   int  `json:"highScore"`
}

const (
	appName     = "snake"
	secretKey   = "your-secret-key-here"
	minInterval = 2
	maxTimeDiff = 3

	// 会话相关的常量
	sessionTimeout  = 30 * time.Minute // 会话超时时间
	cleanupInterval = 5 * time.Minute  // 清理间隔

	// 数据库连接池配置
	maxOpenConns    = 25              // 最大打开连接数
	maxIdleConns    = 5               // 最大空闲连接数
	connMaxLifetime = 5 * time.Minute // 连接最大生命周期
)

var (
	db          *sql.DB
	sessions    = make(map[string]sessionInfo)
	sessionsMap sync.RWMutex
	dbWriteLock sync.Mutex
)

type sessionInfo struct {
	StartTime  time.Time
	LastScore  int
	LastSubmit time.Time
	ExpiresAt  time.Time // 添加过期时间字段
}

func initDB() error {
	var err error
	db, err = sql.Open("sqlite3", "./snake.db")
	if err != nil {
		return fmt.Errorf("failed to open database: %v", err)
	}

	// 配置连接池
	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(maxIdleConns)
	db.SetConnMaxLifetime(connMaxLifetime)

	// 启用 WAL 模式以提高并发性能
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return fmt.Errorf("failed to enable WAL mode: %v", err)
	}

	// 启用外键约束
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return fmt.Errorf("failed to enable foreign keys: %v", err)
	}

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
	r.HandleFunc("/get-scores", validateRequest(handleGetScores))
	r.HandleFunc("/get-replay", validateRequest(handleGetReplay))

	port := 8080
	fmt.Printf("Server starting at http://localhost:%d\n", port)

	// 启动会话清理协程
	go cleanupSessions()

	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), r); err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}

func handleGame(w http.ResponseWriter, r *http.Request) {
	sessionID := generateSessionID()
	sessionsMap.Lock()
	sessions[sessionID] = sessionInfo{
		StartTime:  time.Now(),
		LastScore:  0,
		LastSubmit: time.Time{}, // 使用零值时间
		ExpiresAt:  time.Now().Add(sessionTimeout),
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

	// 解析请求
	var submission ScoreSubmission
	if err := json.NewDecoder(r.Body).Decode(&submission); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 验证会话
	sessionsMap.Lock()
	session, exists := sessions[submission.SessionID]
	if exists {
		// 验证提交间隔
		if time.Since(session.LastSubmit).Seconds() < minInterval && session.LastScore > 0 {
			sessionsMap.Unlock()
			http.Error(w, "Please wait before submitting again", http.StatusTooManyRequests)
			return
		}

		// 更新会话信息
		session.LastSubmit = time.Now()
		session.LastScore = submission.Score
		session.ExpiresAt = time.Now().Add(sessionTimeout)
		sessions[submission.SessionID] = session
	}
	sessionsMap.Unlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusBadRequest)
		return
	}

	// 验证分数提交
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

	// 压缩回放数据
	compressedReplay, err := compressReplay(submission.Replay)
	if err != nil {
		fmt.Printf("Failed to compress replay: %v\n", err)
		http.Error(w, "Failed to process replay data", http.StatusInternalServerError)
		return
	}

	// 使用互斥锁保护数据库写操作
	dbWriteLock.Lock()
	defer dbWriteLock.Unlock()

	// 开始事务
	tx, err := db.Begin()
	if err != nil {
		fmt.Printf("Failed to begin transaction: %v\n", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback() // 在出错时回滚事务

	// 查询当前玩家的历史最高分
	var highScore int
	err = tx.QueryRow(`SELECT COALESCE(MAX(score), 0) FROM scores WHERE name = ?`, submission.Name).Scan(&highScore)
	if err != nil && err != sql.ErrNoRows {
		fmt.Printf("Database error when querying high score: %v\n", err)
		http.Error(w, "Failed to check high score", http.StatusInternalServerError)
		return
	}

	// 判断是否破纪录
	isNewRecord := submission.Score > highScore

	// 更新数据库
	_, err = tx.Exec(`
		INSERT INTO scores (name, score, replay, created_at) 
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(name) DO UPDATE SET 
				score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
				replay = CASE WHEN excluded.score > score THEN excluded.replay ELSE replay END,
				created_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE created_at END
	`, submission.Name, submission.Score, compressedReplay)

	if err != nil {
		fmt.Printf("Database error when updating score: %v\n", err)
		http.Error(w, "Failed to save score", http.StatusInternalServerError)
		return
	}

	// 提交事务
	if err := tx.Commit(); err != nil {
		fmt.Printf("Failed to commit transaction: %v\n", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// 返回响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ScoreResponse{
		IsNewRecord: isNewRecord,
		HighScore:   highScore,
	})
}

func handleGetScores(w http.ResponseWriter, r *http.Request) {
	// 获取昵称参数（可以是多个）
	names := r.URL.Query()["name"]

	var query string
	var args []interface{}

	if len(names) > 0 {
		// 构建 IN 查询
		placeholders := make([]string, len(names))
		for i := range names {
			placeholders[i] = "?"
			args = append(args, names[i])
		}
		query = fmt.Sprintf(`
			SELECT name, score, created_at 
			FROM scores 
			WHERE name IN (%s)
			ORDER BY score DESC
		`, strings.Join(placeholders, ","))
	} else {
		// 不传昵称时获取所有记录
		query = `
			SELECT name, score, created_at 
			FROM scores 
			ORDER BY score DESC 
			LIMIT 10
		`
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		http.Error(w, "Failed to get scores", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	scores := []Score{}
	for rows.Next() {
		var s Score
		if err := rows.Scan(&s.Name, &s.Score, &s.CreatedAt); err != nil {
			fmt.Printf("Scan error: %v\n", err)
			http.Error(w, "Failed to read scores", http.StatusInternalServerError)
			return
		}
		scores = append(scores, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scores)
}

func handleGetReplay(w http.ResponseWriter, r *http.Request) {
	playerName := r.URL.Query().Get("name")
	if playerName == "" {
		http.Error(w, "Player name is required", http.StatusBadRequest)
		return
	}

	var compressedReplay string
	err := db.QueryRow("SELECT replay FROM scores WHERE name = ?", playerName).Scan(&compressedReplay)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Replay not found", http.StatusNotFound)
			return
		}
		fmt.Printf("Database error: %v\n", err)
		http.Error(w, "Failed to get replay", http.StatusInternalServerError)
		return
	}

	// 解压缩回放数据
	if compressedReplay != "" {
		decompressedReplay, err := decompressReplay(compressedReplay)
		if err != nil {
			fmt.Printf("Failed to decompress replay: %v\n", err)
			http.Error(w, "Failed to process replay data", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(decompressedReplay))
	} else {
		w.Write([]byte("[]"))
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

// 添加压缩函数
func compressReplay(data string) (string, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)

	if _, err := gz.Write([]byte(data)); err != nil {
		return "", err
	}

	if err := gz.Close(); err != nil {
		return "", err
	}

	// 使用 base64 编码压缩后的数据，使其可以安全存储在数据库中
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// 添加解压缩函数
func decompressReplay(compressed string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(compressed)
	if err != nil {
		return "", err
	}

	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	defer gz.Close()

	decompressed, err := ioutil.ReadAll(gz)
	if err != nil {
		return "", err
	}

	return string(decompressed), nil
}

// 添加请求验证中间件
func validateRequest(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 获取请求参数
		timestamp := r.URL.Query().Get("timestamp")
		nonce := r.URL.Query().Get("nonce")
		signature := r.URL.Query().Get("signature")

		// 验证参数是否存在
		if timestamp == "" || nonce == "" || signature == "" {
			http.Error(w, "Missing required parameters", http.StatusBadRequest)
			return
		}

		// 验证时间戳
		ts, err := strconv.ParseInt(timestamp, 10, 64)
		if err != nil {
			http.Error(w, "Invalid timestamp", http.StatusBadRequest)
			return
		}

		// 检查时间戳是否在有效期内
		now := time.Now().Unix()
		if abs(now-ts) > maxTimeDiff {
			http.Error(w, "Request expired", http.StatusBadRequest)
			return
		}

		// 构建签名字符串
		params := make(map[string]string)
		for key, values := range r.URL.Query() {
			if key != "signature" { // 排除签名本身
				params[key] = values[0]
			}
		}

		// 按字母顺序排序参数
		var keys []string
		for k := range params {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		// 构建签名字符串
		var signParts []string
		for _, k := range keys {
			signParts = append(signParts, fmt.Sprintf("%s=%s", k, params[k]))
		}
		signString := strings.Join(signParts, "&")

		// 计算预期的签名
		h := hmac.New(sha256.New, []byte(secretKey))
		h.Write([]byte(signString))
		expectedSignature := hex.EncodeToString(h.Sum(nil))

		// 验证签名
		if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
			http.Error(w, "Invalid signature", http.StatusBadRequest)
			return
		}

		next.ServeHTTP(w, r)
	}
}

// 添加会话清理函数
func cleanupSessions() {
	for {
		time.Sleep(cleanupInterval)

		now := time.Now()
		sessionsMap.Lock()

		// 清理过期的会话
		for id, session := range sessions {
			if now.After(session.ExpiresAt) {
				delete(sessions, id)
			}
		}

		sessionsMap.Unlock()
	}
}
