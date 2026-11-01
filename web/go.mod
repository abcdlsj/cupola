// The frontend has no Go packages. This nested module keeps the Go tool from
// walking web/node_modules when the repository root runs `go test ./...`.
module github.com/abcdlsj/cupola/web

go 1.25
