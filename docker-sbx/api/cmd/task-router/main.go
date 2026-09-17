// task-routerは、タスク名の.localhostを各Sandboxの公開ポートへ転送します。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var taskHostPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.localhost$`)

func newRouter(routes map[string]string) (http.Handler, error) {
	if len(routes) == 0 {
		return nil, errors.New("at least one task host is required")
	}
	proxies := make(map[string]*httputil.ReverseProxy, len(routes))
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.ResponseHeaderTimeout = 15 * time.Second
	for host, raw := range routes {
		if !taskHostPattern.MatchString(host) {
			return nil, fmt.Errorf("invalid task host: %s", host)
		}
		target, err := url.Parse(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid upstream for %s", host)
		}
		ip := net.ParseIP(target.Hostname())
		port, err := strconv.Atoi(target.Port())
		if err != nil || port < 1 || port > 65535 || ip == nil || !ip.IsLoopback() || target.Scheme != "http" || target.User != nil || target.Path != "" || target.RawQuery != "" || target.Fragment != "" {
			return nil, fmt.Errorf("upstream for %s must be an HTTP loopback address with a port", host)
		}
		proxies[host] = &httputil.ReverseProxy{
			Rewrite: func(r *httputil.ProxyRequest) {
				r.SetURL(target)
				r.Out.Host = host
				r.SetXForwarded()
			},
			Transport: transport,
			ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
				log.Printf("upstream %s: %v", host, err)
				http.Error(w, "タスクのSandboxへ接続できません。起動状態を確認してください。", http.StatusBadGateway)
			},
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if name, _, err := net.SplitHostPort(host); err == nil {
			host = name
		}
		host = strings.TrimSuffix(strings.ToLower(host), ".")
		proxy, ok := proxies[host]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Task-Host", host)
		proxy.ServeHTTP(w, r)
	}), nil
}

func main() {
	listen := flag.String("listen", "127.0.0.1:80", "HTTP listen address (loopback only)")
	routesPath := flag.String("routes", "dev/task-hosts.json", "task host configuration")
	flag.Parse()
	host, listenPort, err := net.SplitHostPort(*listen)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		log.Fatal("listen address must be an explicit loopback IP and port")
	}
	data, err := os.ReadFile(*routesPath)
	if err != nil {
		log.Fatal(err)
	}
	var routes map[string]string
	if err := json.Unmarshal(data, &routes); err != nil {
		log.Fatal(err)
	}
	handler, err := newRouter(routes)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{Addr: *listen, Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	for host, target := range routes {
		address := host
		if listenPort != "80" {
			address = net.JoinHostPort(host, listenPort)
		}
		log.Printf("http://%s → %s", address, target)
	}
	log.Printf("task router listening on %s", *listen)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
