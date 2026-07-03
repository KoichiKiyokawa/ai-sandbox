# syntax=docker/dockerfile:1
# Multi-stage build for the demo API. stdlib-only, so no go.sum / module fetch.
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o /out/api .

# distroless static + nonroot. No shell, no package manager, runs as UID 65532.
# The CGO_ENABLED=0 Go binary is fully static, so it needs nothing else.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/api"]
