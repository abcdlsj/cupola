// Command seedhub backfills the demo hub with 24 hours of samples and a few
// events so the screenshots and local demo show rich, organic charts. It writes
// the hub's SQLite directly and is a fixture tool only; the product has no such
// endpoint.
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

type profile struct {
	cpu   float64
	mem   float64
	load  float64
	netRx float64
	netTx float64
	diskR float64
	diskW float64
	psi   float64
}

func profileFor(node string) profile {
	switch node {
	case "atlas":
		return profile{cpu: 20, mem: 62, load: 0.45, netRx: 1_200_000, netTx: 480_000, diskR: 1_800_000, diskW: 650_000, psi: 1.2}
	case "beelink":
		return profile{cpu: 38, mem: 56, load: 2.6, netRx: 8_400_000, netTx: 2_100_000, diskR: 14_000_000, diskW: 5_400_000, psi: 4.5}
	case "studio":
		return profile{cpu: 72, mem: 86, load: 18.5, netRx: 22_000_000, netTx: 5_800_000, diskR: 38_000_000, diskW: 16_000_000, psi: 11.0}
	default:
		return profile{cpu: 30, mem: 55, load: 1.2, netRx: 2_000_000, netTx: 800_000, diskR: 4_000_000, diskW: 1_500_000, psi: 2.0}
	}
}

func wave(t float64, period float64) float64 {
	return 0.65*math.Sin(t/period) + 0.35*math.Cos(t/(period*0.37))
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

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
		p := profileFor(node)
		seedRaw(ctx, db, node, now, p)
		seedMinutes(ctx, db, node, now, p)
		seedHours(ctx, db, node, now, p)
		if err := seedEvents(ctx, db, node, now); err != nil {
			log.Fatal(err)
		}
	}
	fmt.Println("seeded", *nodes)
}

func seedRaw(ctx context.Context, db *sql.DB, node string, now int64, p profile) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 2 * 3600; i >= 0; i -= 5 {
		ts := now - int64(i)*1000
		t := float64(ts) / 1000
		cpu := clamp(p.cpu+11*wave(t, 420)+rand.Float64()*4, 2, 98)
		mem := clamp(p.mem+6*wave(t+900, 1800)+rand.Float64()*1.5, 10, 96)
		load := clamp(p.load*(1+0.32*wave(t+200, 500))+rand.Float64()*0.3, 0.05, 48)
		netRx := math.Max(50_000, p.netRx*(1+0.55*wave(t+60, 280)+rand.Float64()*0.35))
		netTx := math.Max(20_000, p.netTx*(1+0.45*wave(t+180, 310)+rand.Float64()*0.25))
		diskR := math.Max(40_000, p.diskR*(0.6+0.7*math.Abs(wave(t+40, 210))+rand.Float64()*0.4))
		diskW := math.Max(20_000, p.diskW*(0.5+0.65*math.Abs(wave(t+120, 260))+rand.Float64()*0.3))
		psiCpu := clamp(p.psi*(0.7+0.6*math.Abs(wave(t, 360))+rand.Float64()*0.3), 0.1, 45)
		psiIo := clamp(p.psi*0.55*(0.6+0.65*math.Abs(wave(t+240, 410))+rand.Float64()*0.25), 0.1, 35)
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples(node_id,ts,cpu,mem,mem_used,mem_total,load1,load5,load15,net_rx,net_tx,disk_r,disk_w,procs,uptime,psi_cpu,psi_io,psi_mem)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			node, ts, cpu, mem, int64(mem/100*float64(32<<30)), 32<<30, load, load*0.92, load*0.85,
			netRx, netTx, diskR, diskW, 180, 3600*24*12, psiCpu, psiIo, psiCpu*0.3)
	}
	_ = tx.Commit()
}

func seedMinutes(ctx context.Context, db *sql.DB, node string, now int64, p profile) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 24 * 60; i >= 0; i-- {
		ts := (now/60000 - int64(i)) * 60000
		t := float64(ts) / 1000
		cpu := clamp(p.cpu+13*wave(t, 5400)+rand.Float64()*4, 2, 98)
		mem := clamp(p.mem+8*wave(t+3200, 14400)+rand.Float64()*1.5, 10, 96)
		load := clamp(p.load*(1+0.38*wave(t+1200, 6200))+rand.Float64()*0.3, 0.05, 48)
		netRx := math.Max(50_000, p.netRx*(1+0.6*wave(t+600, 3800)+rand.Float64()*0.3))
		netTx := math.Max(20_000, p.netTx*(1+0.5*wave(t+1800, 4200)+rand.Float64()*0.25))
		diskR := math.Max(40_000, p.diskR*(0.55+0.75*math.Abs(wave(t+400, 3100))+rand.Float64()*0.35))
		diskW := math.Max(20_000, p.diskW*(0.45+0.7*math.Abs(wave(t+1400, 3500))+rand.Float64()*0.3))
		psiCpu := clamp(p.psi*(0.65+0.65*math.Abs(wave(t, 4800))+rand.Float64()*0.3), 0.1, 45)
		psiIo := clamp(p.psi*0.55*(0.55+0.7*math.Abs(wave(t+2000, 5200))+rand.Float64()*0.25), 0.1, 35)
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples_1m(node_id,ts,cpu_min,cpu_avg,cpu_max,mem_min,mem_avg,mem_max,load_avg,load_max,net_rx_avg,net_tx_avg,disk_r_avg,disk_w_avg,psi_cpu_avg,psi_io_avg,psi_mem_avg)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			node, ts, cpu-3, cpu, cpu+4, mem-1.5, mem, mem+1.5, load, load*1.25,
			netRx, netTx, diskR, diskW, psiCpu, psiIo, psiCpu*0.3)
	}
	_ = tx.Commit()
}

func seedHours(ctx context.Context, db *sql.DB, node string, now int64, p profile) {
	tx, _ := db.BeginTx(ctx, nil)
	defer tx.Rollback()
	for i := 7 * 24; i >= 0; i-- {
		ts := (now/3600000 - int64(i)) * 3600000
		t := float64(ts) / 1000
		cpu := clamp(p.cpu+12*wave(t, 28800)+rand.Float64()*4, 2, 98)
		mem := clamp(p.mem+9*wave(t+18000, 86400)+rand.Float64()*2, 10, 96)
		load := clamp(p.load*(1+0.35*wave(t+7200, 32000))+rand.Float64()*0.3, 0.05, 48)
		netRx := math.Max(50_000, p.netRx*(1+0.55*wave(t+3600, 24000)+rand.Float64()*0.3))
		netTx := math.Max(20_000, p.netTx*(1+0.45*wave(t+9600, 27000)+rand.Float64()*0.25))
		diskR := math.Max(40_000, p.diskR*(0.55+0.7*math.Abs(wave(t+1800, 21000))+rand.Float64()*0.35))
		diskW := math.Max(20_000, p.diskW*(0.45+0.65*math.Abs(wave(t+8400, 25000))+rand.Float64()*0.3))
		psiCpu := clamp(p.psi*(0.65+0.6*math.Abs(wave(t, 28000))+rand.Float64()*0.3), 0.1, 45)
		psiIo := clamp(p.psi*0.55*(0.55+0.65*math.Abs(wave(t+12000, 31000))+rand.Float64()*0.25), 0.1, 35)
		_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO samples_1h(node_id,ts,cpu_min,cpu_avg,cpu_max,mem_min,mem_avg,mem_max,load_avg,load_max,net_rx_avg,net_tx_avg,disk_r_avg,disk_w_avg,psi_cpu_avg,psi_io_avg,psi_mem_avg)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			node, ts, cpu-4, cpu, cpu+5, mem-2, mem, mem+2, load, load*1.3,
			netRx, netTx, diskR, diskW, psiCpu, psiIo, psiCpu*0.3)
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
