package hub

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/abcdlsj/cupola/internal/hub/store"
)

// transportManager returns the HTTP client and base URL for a pull node. Pull
// only exists for agents the hub can dial, so there is exactly one dialer:
// plain HTTP. NATed agents push instead (see ingest.go).
type transportManager struct {
	key []byte
}

func newTransportManager(key []byte) *transportManager { return &transportManager{key: key} }

type nodeEndpoint struct {
	HTTP  *http.Client
	Base  string
	Token string
}

func (t *transportManager) endpoint(ctx context.Context, secret store.NodeSecret) (nodeEndpoint, error) {
	token, err := decrypt(t.key, secret.Token)
	if err != nil {
		return nodeEndpoint{}, fmt.Errorf("node token: %w", err)
	}
	if secret.Node.URL == "" {
		return nodeEndpoint{}, errors.New("node has no URL")
	}
	return nodeEndpoint{
		HTTP:  &http.Client{Timeout: 0},
		Base:  strings.TrimRight(secret.Node.URL, "/"),
		Token: string(token),
	}, nil
}
