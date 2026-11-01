// Command seedhub backfills the demo hub with 24 hours of samples and a few
// events so the screenshots show full charts. It writes the hub's SQLite
// directly and is a fixture tool only; the product has no such endpoint.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := flag.String("db", ".e2e-data/cupola.db", "hub database")
	nodes := flag.String("nodes", "atlas,beelink,studio", "comma separated node ids")
	flag.Parse()
	db, err := sql.Open("sqlite", "file:"+*dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	now := time.Now().UnixMilli()
	for _, node := range strings.Split(*nodes, ",") {
		base := map[string]float64{"atlas": 18, "beelink": 34, "studio": 71}[node]
		if base == 0 {
			base = 30
		}
		seedRaw(ctx, db, node, now, base)
		seedMinutes(ctx, db, node, now, base)
		seedHours(ctx, db, node, now, base)
		if err := seedEvents(ctx, db, node, now); err != nil {
			log.Fatal(err)
		}
	}
	fmt.Println("seeded", *nodes)
}

func seedRaw(ctx context.Context, db *sql.DB, node string, now int64, base float64) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 2 * 3600; i >= 0; i -= 5 {
		ts := now - int64(i)*1000
		value := base + 9*math.Sin(float64(ts/60000)) + rand.Float64()*4
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples(node_id,ts,cpu,mem,mem_used,mem_total,load1,load5,load15,net_rx,net_tx,disk_r,disk_w,procs,uptime,psi_cpu,psi_io,psi_mem)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, node, ts, value, 65, 8<<30, 16<<30, 1.2, 1.1, 0.9, 800000, 240000, 400000, 200000, 180, 3600, 3, 2, 1)
	}
	_ = tx.Commit()
}

func seedMinutes(ctx context.Context, db *sql.DB, node string, now int64, base float64) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 24 * 60; i >= 0; i-- {
		ts := (now/60000 - int64(i)) * 60000
		value := base + 8*math.Sin(float64(ts/3600000)) + rand.Float64()*3
		min, max := value-2, value+2
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples_1m(node_id,ts,cpu_min,cpu_avg,cpu_max,mem_min,mem_avg,mem_max,load_avg,load_max,net_rx_avg,net_tx_avg,disk_r_avg,disk_w_avg,psi_cpu_avg,psi_io_avg,psi_mem_avg)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, node, ts, min, value, max, 64, 65, 66, 1.2, 1.6, 800000, 240000, 400000, 200000, 3, 2, 1)
	}
	_ = tx.Commit()
}

func seedHours(ctx context.Context, db *sql.DB, node string, now int64, base float64) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 7 * 24; i >= 0; i-- {
		ts := (now/3600000 - int64(i)) * 3600000
		value := base + 7*math.Sin(float64(ts/86400000)) + rand.Float64()*2
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples_1h(node_id,ts,cpu_min,cpu_avg,cpu_max,mem_min,mem_avg,mem_max,load_avg,load_max,net_rx_avg,net_tx_avg,disk_r_avg,disk_w_avg,psi_cpu_avg,psi_io_avg,psi_mem_avg)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, node, ts, value-3, value, value+3, 64, 65, 66, 1.2, 1.7, 800000, 240000, 400000, 200000, 3, 2, 1)
	}
	_ = tx.Commit()
}

func seedEvents(ctx context.Context, db *sql.DB, node string, now int64) error {
	var count int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM events WHERE node_id = ?`, node).Scan(&count)
	if count > 0 {
		return nil
	}
	type row struct {
		offset int64
		kind   string
		sev    string
		text   string
	}
	rows := []row{}
	switch node {
	case "studio":
		rows = []row{
			{6 * 60000, "disk", "warning", "Root filesystem above 90%"},
			{44 * 60000, "container", "warning", "Container ollama restarted (4 total)"},
			{2 * 3600000, "action", "warning", "Restart Jellyfin failed with exit 1"},
		}
	case "beelink":
		rows = []row{
			{24 * 60000, "service", "warning", "Unit failed: restic-backup.service"},
			{2 * 3600000, "network", "info", "New listening port 8080 (docker-proxy)"},
		}
	default:
		rows = []row{{3 * 3600000, "system", "info", "Rebooted (boot time changed)"}}
	}
	for _, row := range rows {
		if _, err := db.ExecContext(ctx, `INSERT INTO events(node_id,ts,kind,severity,message,meta) VALUES(?,?,?,?,?,?)`,
			node, now-row.offset, row.kind, row.sev, row.text, ""); err != nil {
			return err
		}
	}
	return nil
}
