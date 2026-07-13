package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

func main() {
	db, err := sql.Open("postgres", "postgres://xalms:xalms_secure_2026@72.60.203.40:5435/xalms_dev?sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("=== class_sessions rows for the 4 'XA Learn Accuracy' Live Session activities ===")
	rows, _ := db.Query(`
		SELECT a.id::text, a.title,
		       cs.id::text, cs.status, cs.scheduled_at, COALESCE(cs.cohort_id::text,'<NULL>')
		FROM activities a
		LEFT JOIN class_sessions cs ON cs.activity_id = a.id
		WHERE a.id IN (
			'a4dcd224-e949-47b1-bc47-d9054bce3dcf','96b037a0-a551-4888-8e82-85a335363f95',
			'd39de572-8460-4433-ab73-71878ebcd9f8','4f94932d-aca8-498b-af7d-b560d38e7a88'
		)`)
	for rows.Next() {
		var aid, atitle string
		var csid, status, sched, cid sql.NullString
		rows.Scan(&aid, &atitle, &csid, &status, &sched, &cid)
		fmt.Println(aid, atitle, "-> session:", csid.String, status.String, sched.String, cid.String)
	}
	rows.Close()

	fmt.Println()
	fmt.Println("=== does Raj Sharma (8696c9d0) have any enrollment in program bdf1efa1? ===")
	var cnt int
	db.QueryRow(`
		SELECT count(*) FROM enrollments e JOIN cohorts c ON c.id=e.cohort_id
		WHERE e.user_id='8696c9d0-a0be-46a6-b2bb-19c3e01d6dd9' AND c.program_id='bdf1efa1-51ac-4f50-87fc-87c6945f4cd4'`).Scan(&cnt)
	fmt.Println("enrollment count in that program:", cnt)

	fmt.Println()
	fmt.Println("=== ALL enrollments for user 8696c9d0 (any status incl withdrawn) ===")
	rows2, _ := db.Query(`SELECT cohort_id::text, status FROM enrollments WHERE user_id='8696c9d0-a0be-46a6-b2bb-19c3e01d6dd9'`)
	for rows2.Next() {
		var cid, status string
		rows2.Scan(&cid, &status)
		fmt.Println(cid, status)
	}
	rows2.Close()
}
