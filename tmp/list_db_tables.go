package main

import (
	"database/sql"
	"fmt"
	"log"
	"sort"

	_ "github.com/lib/pq"
)

func main() {
	dsn := `postgres://xalms:xalms_secure_2026@72.60.203.40:5435/xalms_dev?sslmode=disable`
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query(`
		select schemaname, tablename
		from pg_catalog.pg_tables
		where schemaname not in ('pg_catalog', 'information_schema')
		order by schemaname, tablename
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	tables := make([]string, 0)
	for rows.Next() {
		var schema, table string
		if err := rows.Scan(&schema, &table); err != nil {
			log.Fatal(err)
		}
		tables = append(tables, fmt.Sprintf("%s.%s", schema, table))
	}
	if err := rows.Err(); err != nil {
		log.Fatal(err)
	}

	sort.Strings(tables)
	for _, table := range tables {
		fmt.Println(table)
	}
}
