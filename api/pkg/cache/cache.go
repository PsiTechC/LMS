package cache

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
var bg = context.Background()

// ErrMiss is returned when a key is not found in the cache.
var ErrMiss = errors.New("cache miss")

// Init connects to Redis using REDIS_URL from the environment.
// Silently no-ops if REDIS_URL is unset — all Get/Set calls become cache misses.
func Init() {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		url = "redis://localhost:6379"
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		return
	}
	rdb = redis.NewClient(opt)
	// Ping to confirm connectivity; if it fails, disable cache gracefully.
	if err := rdb.Ping(bg).Err(); err != nil {
		rdb = nil
	}
}

// Get unmarshals a cached JSON value into dest.
// Returns ErrMiss if the key does not exist or Redis is unavailable.
func Get(key string, dest any) error {
	if rdb == nil {
		return ErrMiss
	}
	b, err := rdb.Get(bg, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return ErrMiss
	}
	if err != nil {
		return ErrMiss
	}
	return json.Unmarshal(b, dest)
}

// Set marshals value to JSON and stores it with the given TTL.
// Silently no-ops if Redis is unavailable.
func Set(key string, value any, ttl time.Duration) {
	if rdb == nil {
		return
	}
	b, err := json.Marshal(value)
	if err != nil {
		return
	}
	rdb.Set(bg, key, b, ttl)
}

// Del deletes one or more keys. Silently no-ops if Redis is unavailable.
func Del(keys ...string) {
	if rdb == nil {
		return
	}
	rdb.Del(bg, keys...)
}

// DelPattern deletes all keys matching a glob pattern (e.g. "programs:org:*").
// Uses SCAN to avoid blocking Redis on large keyspaces.
func DelPattern(pattern string) {
	if rdb == nil {
		return
	}
	var cursor uint64
	for {
		keys, next, err := rdb.Scan(bg, cursor, pattern, 100).Result()
		if err != nil {
			return
		}
		if len(keys) > 0 {
			rdb.Del(bg, keys...)
		}
		cursor = next
		if cursor == 0 {
			return
		}
	}
}
