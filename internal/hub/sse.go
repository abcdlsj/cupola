package hub

import (
	"encoding/json"
	"sync"
)

type sseMessage struct {
	event string
	data  []byte
}

type broadcaster struct {
	mu      sync.Mutex
	clients map[chan sseMessage]struct{}
}

func newBroadcaster() *broadcaster {
	return &broadcaster{clients: make(map[chan sseMessage]struct{})}
}

func (b *broadcaster) send(event string, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	message := sseMessage{event: event, data: body}
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- message:
		default:
			// A slow dashboard must not block the poller.
		}
	}
}

func (b *broadcaster) subscribe() (<-chan sseMessage, func()) {
	ch := make(chan sseMessage, 16)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		delete(b.clients, ch)
		b.mu.Unlock()
		close(ch)
	}
}
