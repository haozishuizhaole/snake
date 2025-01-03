package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io/ioutil"
	"net"
	"net/http"
	"sort"
	"sync"
	"time"
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
	appName     = "snake"                // 应用名称
	secretKey   = "your-secret-key-here" // 在实际应用中应该使用环境变量
	minInterval = 2                      // 两次提交之间的最小间隔(秒)
	maxTimeDiff = 3                      // 时间戳过期时间(秒)
)

var (
	scores      = make(map[string]int)
	scoresMap   sync.RWMutex
	sessions    = make(map[string]sessionInfo)
	sessionsMap sync.RWMutex
)

type sessionInfo struct {
	StartTime  time.Time
	LastScore  int
	LastSubmit time.Time
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

type ScoreList []Score

func (s ScoreList) Len() int           { return len(s) }
func (s ScoreList) Less(i, j int) bool { return s[i].Score > s[j].Score }
func (s ScoreList) Swap(i, j int)      { s[i], s[j] = s[j], s[i] }

func main() {
	// 加载已存在的分数
	loadScores()

	// 静态文件服务
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// 路由处理
	http.HandleFunc("/", handleGame)
	http.HandleFunc("/submit-score", handleSubmitScore)
	http.HandleFunc("/get-scores", handleGetScores)

	// 从8080开始尝试端口
	port := 8080
	for {
		listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err != nil {
			fmt.Printf("Port %d is in use, trying next port\n", port)
			port++
			continue
		}
		listener.Close()
		break
	}

	fmt.Printf("Server starting at http://localhost:%d\n", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), nil); err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}

func handleGame(w http.ResponseWriter, r *http.Request) {
	// 生成新的会话ID
	sessionID := generateSessionID()

	// 记录会话信息
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

	// 验证会话存在性
	sessionsMap.RLock()
	session, exists := sessions[score.SessionID]
	sessionsMap.RUnlock()
	if !exists {
		http.Error(w, "Invalid session", http.StatusBadRequest)
		return
	}

	// 验证提交时间间隔
	if time.Since(session.LastSubmit).Seconds() < minInterval {
		http.Error(w, "Please wait before submitting again", http.StatusTooManyRequests)
		return
	}

	// 验证分数不能为负
	if score.Score < 0 {
		http.Error(w, "Invalid score", http.StatusBadRequest)
		return
	}

	// 验证分数增长合理性
	if score.Score <= session.LastScore {
		http.Error(w, "Invalid score progression", http.StatusBadRequest)
		return
	}

	// 验证时间戳
	timeDiff := time.Now().Unix() - score.Timestamp
	if timeDiff > maxTimeDiff || timeDiff < -maxTimeDiff {
		http.Error(w, "Score submission timeout", http.StatusBadRequest)
		return
	}

	// 验证nonce不为空
	if score.Nonce == "" {
		http.Error(w, "Missing nonce", http.StatusBadRequest)
		return
	}

	// 验证哈希
	if !validateScoreHash(score) {
		http.Error(w, "Invalid score hash", http.StatusBadRequest)
		return
	}

	scoresMap.Lock()
	if existingScore, ok := scores[score.Name]; !ok || score.Score > existingScore {
		scores[score.Name] = score.Score
		saveScores()
	}
	scoresMap.Unlock()

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
	scoresMap.RLock()
	defer scoresMap.RUnlock()

	var scoreList ScoreList
	for name, score := range scores {
		scoreList = append(scoreList, Score{
			Name:  name,
			Score: score,
		})
	}

	sort.Sort(scoreList)
	if len(scoreList) > 10 {
		scoreList = scoreList[:10]
	}

	json.NewEncoder(w).Encode(scoreList)
}

func loadScores() {
	data, err := ioutil.ReadFile("scores.json")
	if err != nil {
		return
	}

	scoresMap.Lock()
	json.Unmarshal(data, &scores)
	scoresMap.Unlock()
}

func saveScores() {
	data, err := json.Marshal(scores)
	if err != nil {
		return
	}
	ioutil.WriteFile("scores.json", data, 0644)
}
