package hub

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/abcdlsj/bolthole"
	"github.com/abcdlsj/bolthole/client"

	"github.com/abcdlsj/cupola/internal/hub/store"
)

// transportManager returns an HTTP client and base URL for a node, either
// direct or through a Bolthole relay. Relayed clients keep a live E2E session,
// so they are cached until the node is edited or removed.
type transportManager struct {
	key []byte

	mu      sync.Mutex
	clients map[string]*client.Client
}

func newTransportManager(key []byte) *transportManager {
	return &transportManager{key: key, clients: make(map[string]*client.Client)}
}

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
	switch secret.Node.Transport {
	case "bolthole":
		conn, err := decrypt(t.key, secret.Conn)
		if err != nil {
			return nodeEndpoint{}, fmt.Errorf("node connection: %w", err)
		}
		if len(conn) == 0 {
			return nodeEndpoint{}, errors.New("node has no Bolthole connection string")
		}
		relayClient, err := t.relayClient(secret.Node.ID, string(conn))
		if err != nil {
			return nodeEndpoint{}, err
		}
		return nodeEndpoint{HTTP: relayClient.HTTPClient(), Base: "http://agent", Token: string(token)}, nil
	case "", "direct":
		if secret.Node.URL == "" {
			return nodeEndpoint{}, errors.New("node has no URL")
		}
		return nodeEndpoint{
			HTTP:  &http.Client{Timeout: 0},
			Base:  strings.TrimRight(secret.Node.URL, "/"),
			Token: string(token),
		}, nil
	default:
		return nodeEndpoint{}, fmt.Errorf("unknown transport %q", secret.Node.Transport)
	}
}

func (t *transportManager) relayClient(id, connString string) (*client.Client, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if existing, ok := t.clients[id]; ok {
		return existing, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	relayClient, err := bolthole.Dial(connString)
	if err != nil {
		return nil, fmt.Errorf("bolthole dial: %w", err)
	}
	_ = ctx
	t.clients[id] = relayClient
	return relayClient, nil
}

func (t *transportManager) forget(id string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.clients, id)
}
