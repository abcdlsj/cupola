package hub

import (
	"net"
	"strings"
	"testing"
	"time"
)

func TestEncryptRoundTrip(t *testing.T) {
	key := []byte(strings.Repeat("k", 32))
	sealed, err := encrypt(key, []byte("s3cret"))
	if err != nil {
		t.Fatal(err)
	}
	plain, err := decrypt(key, sealed)
	if err != nil || string(plain) != "s3cret" {
		t.Fatalf("decrypt = %q, %v", plain, err)
	}
	if string(sealed) == "s3cret" {
		t.Fatal("ciphertext equals plaintext")
	}
	sealed[len(sealed)-1] ^= 0xff
	if _, err := decrypt(key, sealed); err == nil {
		t.Fatal("tampered ciphertext accepted")
	}
}

func TestPasswordHash(t *testing.T) {
	hash, err := hashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("hash = %q", hash)
	}
	if !verifyPassword("correct horse battery", hash) {
		t.Fatal("correct password rejected")
	}
	if verifyPassword("wrong", hash) {
		t.Fatal("wrong password accepted")
	}
}

func TestSessionSignature(t *testing.T) {
	key := []byte(strings.Repeat("k", 32))
	value, err := signSession(key, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !verifySession(key, value) {
		t.Fatal("session rejected")
	}
	if verifySession([]byte(strings.Repeat("x", 32)), value) {
		t.Fatal("session accepted with the wrong key")
	}
	parts := strings.Split(value, ".")
	if verifySession(key, parts[0]+".00") {
		t.Fatal("tampered signature accepted")
	}
}

func TestTokenShape(t *testing.T) {
	id, secret, token, hash, err := newAPIToken()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, "cupola_"+id+"_"+secret) {
		t.Fatalf("token = %q", token)
	}
	if hashSecret(secret) != hash {
		t.Fatal("hash mismatch")
	}
	if len(tokenPrefix(id, secret)) >= len(token) {
		t.Fatal("prefix leaks the whole token")
	}
}

func parseIP(value string) net.IP { return net.ParseIP(value) }

func TestPublicIP(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.5", "172.16.4.4", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1"} {
		if publicIP(parseIP(ip)) {
			t.Fatalf("%s treated as public", ip)
		}
	}
	for _, ip := range []string{"8.8.8.8", "1.1.1.1", "192.0.2.10", "2606:4700:4700::1111"} {
		if !publicIP(parseIP(ip)) {
			t.Fatalf("%s treated as private", ip)
		}
	}
}

func TestValidateChannelURL(t *testing.T) {
	if err := validateChannelURL("http://127.0.0.1/hook", false); err == nil {
		t.Fatal("loopback webhook accepted")
	}
	if err := validateChannelURL("ftp://example.com/hook", false); err == nil {
		t.Fatal("ftp webhook accepted")
	}
	if err := validateChannelURL("not a url", false); err == nil {
		t.Fatal("garbage accepted")
	}
}
