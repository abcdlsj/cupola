package agent

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCompressJSONOnlyWhenTheClientAsks(t *testing.T) {
	handler := compressJSON(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"hello": strings.Repeat("x", 512)})
	}))

	plain := httptest.NewRecorder()
	handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/v1/snapshot", nil))
	if got := plain.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q for a client without gzip", got)
	}
	if !strings.Contains(plain.Body.String(), `"hello"`) {
		t.Fatal("the plain body is not JSON")
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/snapshot", nil)
	request.Header.Set("Accept-Encoding", "deflate, gzip;q=0.9")
	zipped := httptest.NewRecorder()
	handler.ServeHTTP(zipped, request)
	if got := zipped.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	if got := zipped.Header().Get("Vary"); !strings.Contains(got, "Accept-Encoding") {
		t.Fatalf("Vary = %q", got)
	}
	reader, err := gzip.NewReader(zipped.Body)
	if err != nil {
		t.Fatalf("gzip: %v", err)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.Contains(string(body), `"hello"`) {
		t.Fatalf("decompressed body = %q", body)
	}
	if zipped.Body.Len() >= plain.Body.Len() {
		t.Fatalf("compressed %d bytes is not smaller than %d", zipped.Body.Len(), plain.Body.Len())
	}
}

func TestCompressJSONLeavesTheEventStreamAlone(t *testing.T) {
	handler := compressJSON(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "event: tick\ndata: {}\n\n")
	}))
	request := httptest.NewRequest(http.MethodGet, "/v1/stream", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if got := recorder.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("the event stream was %q encoded", got)
	}
	if !strings.Contains(recorder.Body.String(), "event: tick") {
		t.Fatalf("body = %q", recorder.Body.String())
	}
}
