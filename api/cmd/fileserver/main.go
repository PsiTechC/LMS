// fileserver - shared upload server for XA-LMS dev environment.
// Run this once on the shared VPS. Both devs point FILE_SERVER_URL at it.
//
// Usage:
//
//	PORT=9000 UPLOAD_DIR=/var/www/xa-uploads SECRET=changeme ./fileserver
//
// POST /upload  (multipart "file" field, requires Authorization: Bearer <SECRET>)
// GET  /files/<filename>  (public, no auth)
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

var allowedExt = map[string]bool{
	".pdf": true, ".ppt": true, ".pptx": true,
	".mp4": true, ".mov": true, ".avi": true, ".mkv": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".zip": true, ".docx": true, ".xlsx": true,
	".md": true, ".html": true, ".txt": true,
}

func main() {
	uploadDir := env("UPLOAD_DIR", "/var/www/xa-uploads")
	secret := env("SECRET", "changeme")
	port := env("PORT", "9000")
	publicURL := env("PUBLIC_URL", "http://72.60.203.40:9000")

	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Fatalf("cannot create upload dir: %v", err)
	}

	mux := http.NewServeMux()

	// POST /upload - receive a file, save it, return JSON with url
	mux.HandleFunc("/upload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// Simple bearer-token auth so random internet traffic can't fill the disk
		auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if auth != secret {
			jsonErr(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid secret")
			return
		}
		if err := r.ParseMultipartForm(50 << 20); err != nil { // 50 MB
			jsonErr(w, http.StatusBadRequest, "VALIDATION_ERROR", "file too large (max 50 MB)")
			return
		}
		file, fh, err := r.FormFile("file")
		if err != nil {
			jsonErr(w, http.StatusBadRequest, "VALIDATION_ERROR", "file field is required")
			return
		}
		defer file.Close()

		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if !allowedExt[ext] {
			jsonErr(w, http.StatusBadRequest, "VALIDATION_ERROR", "file type not allowed: "+ext)
			return
		}

		name := fmt.Sprintf("%s%s", uuid.New().String(), ext)
		dst, err := os.Create(filepath.Join(uploadDir, name))
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "INTERNAL_ERROR", "cannot create file")
			return
		}
		defer dst.Close()
		if _, err = io.Copy(dst, file); err != nil {
			jsonErr(w, http.StatusInternalServerError, "INTERNAL_ERROR", "cannot write file")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"url":        fmt.Sprintf("%s/files/%s", publicURL, name),
				"filename":   fh.Filename,
				"size_bytes": fh.Size,
			},
			"error": nil,
		})
	})

	// GET /files/<name> - serve files publicly (participants preview in browser)
	mux.Handle("/files/", http.StripPrefix("/files/", http.FileServer(http.Dir(uploadDir))))

	// Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	log.Printf("🗄  XA-LMS file server on :%s  (uploads → %s)", port, uploadDir)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func jsonErr(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{
		"data":  nil,
		"error": map[string]string{"code": code, "message": msg},
	})
}
