# Formatarr

A user-friendly alternative to Tdarr: automatically convert your media library with simple rules, from a clean web interface.

> Early development: not ready for use yet.

## Features

- **Libraries**: point Formatarr at your media folders.
- **Rules**: describe what to convert with conditions and actions, no ffmpeg knowledge required.
- **Radarr / Sonarr integration**: keep your *arr apps in sync after conversions.
- **Workers**: run ffmpeg jobs on one or several machines.
- **Web UI**: job queue, progress, files browser and workers overview.

## How it works

Formatarr is made of a server (API and web interface) and one or more workers. The server scans your libraries and queues jobs according to your rules. Workers pick up jobs, run ffmpeg, and report progress back to the server.

## Installation

TODO: Docker and docker-compose installation instructions.
