package hub

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

// encrypt seals plaintext with AES-256-GCM. The output is nonce||ciphertext.
func encrypt(key, plaintext []byte) ([]byte, error) {
	if len(plaintext) == 0 {
		return nil, nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func decrypt(key, sealed []byte) ([]byte, error) {
	if len(sealed) == 0 {
		return nil, nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("ciphertext is truncated")
	}
	nonce, body := sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():]
	return gcm.Open(nil, nonce, body, nil)
}

// argon2id parameters: 64 MiB, one pass, four lanes. Login is rare; memory is
// the cost that matters.
const (
	argonTime    = 1
	argonMemory  = 64 * 1024
	argonThreads = 4
	argonKeyLen  = 32
)

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var memory, iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ---------- sessions ----------

type sessionPayload struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
}

func signSession(key []byte, ttl time.Duration) (string, error) {
	payload := sessionPayload{Sub: "admin", Exp: time.Now().Add(ttl).UnixMilli()}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(body)
	return base64.RawURLEncoding.EncodeToString(body) + "." + hex.EncodeToString(mac.Sum(nil)), nil
}

func verifySession(key []byte, value string) bool {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return false
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	signature, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(body)
	if !hmac.Equal(mac.Sum(nil), signature) {
		return false
	}
	var payload sessionPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return false
	}
	return payload.Sub == "admin" && payload.Exp > time.Now().UnixMilli()
}

// ---------- API tokens ----------

// newAPIToken returns the display id, the one-time secret and the token the
// operator copies.
func newAPIToken() (id, secret, token string, hash string, err error) {
	idBytes := make([]byte, 6)
	if _, err := rand.Read(idBytes); err != nil {
		return "", "", "", "", err
	}
	secretBytes := make([]byte, 24)
	if _, err := rand.Read(secretBytes); err != nil {
		return "", "", "", "", err
	}
	id = hex.EncodeToString(idBytes)
	secret = base64.RawURLEncoding.EncodeToString(secretBytes)
	sum := sha256.Sum256([]byte(secret))
	return id, secret, "cupola_" + id + "_" + secret, hex.EncodeToString(sum[:]), nil
}

func tokenPrefix(id, secret string) string {
	short := secret
	if len(short) > 6 {
		short = short[:6]
	}
	return "cupola_" + id + "_" + short
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func randomID(bytes int) string {
	buf := make([]byte, bytes)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
