FROM golang:1.23.2-alpine AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/app ./main.go

FROM alpine:3.21
RUN adduser -D -u 10001 appuser
USER appuser
WORKDIR /app
COPY --from=builder /bin/app /app/app
EXPOSE 8080
CMD ["/app/app"]
