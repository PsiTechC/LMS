package shared

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
)

// EncryptSecret encrypts plaintext with AES-256-GCM using ZOOM_TOKEN_ENCRYPTION_KEY
// (a 32-byte key, base64-encoded in the environment). The returned string is
// base64(nonce || ciphertext), safe to store directly in a TEXT column.
//
// This is a general-purpose at-rest secret encryptor, not Zoom-specific — the
// env var name is scoped to its first caller (OAuth refresh/access tokens)
// but nothing here depends on Zoom.
func EncryptSecret(plaintext string) (string, error) {
	block, err := cipherBlock()
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: failed to init GCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("crypto: failed to generate nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptSecret reverses EncryptSecret.
func DecryptSecret(encoded string) (string, error) {
	block, err := cipherBlock()
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("crypto: failed to init GCM: %w", err)
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("crypto: invalid ciphertext encoding: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("crypto: ciphertext too short")
	}
	nonce, ct := raw[:nonceSize], raw[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("crypto: decryption failed: %w", err)
	}
	return string(plaintext), nil
}

func cipherBlock() (cipher.Block, error) {
	keyB64 := os.Getenv("ZOOM_TOKEN_ENCRYPTION_KEY")
	if keyB64 == "" {
		return nil, errors.New("crypto: ZOOM_TOKEN_ENCRYPTION_KEY is not configured")
	}
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return nil, fmt.Errorf("crypto: ZOOM_TOKEN_ENCRYPTION_KEY is not valid base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("crypto: ZOOM_TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: failed to init AES cipher: %w", err)
	}
	return block, nil
}
