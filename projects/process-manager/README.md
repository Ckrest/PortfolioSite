# Process Manager v2.0

A GTK GUI for managing systemd user services. View status, start/stop services, and monitor logs from journalctl with real-time streaming.

## What's New in v2.0

- **Status Caching** - Reduced subprocess spawning from 15+ per second to ~5 (3x improvement)
- **Real-time Log Streaming** - Live logs via `journalctl -f` instead of loading once at startup
- **Expanded Settings** - View preferences, behavior settings, column customization
- **Modular Architecture** - Separated concerns into ProcessListWidget, LogViewerWidget
- **Memory/Restart Tracking** - Shows memory usage and restart count per service
- **Search & Filtering** - Search logs with highlighting, filter by level
- **Auto-scroll Control** - Toggle auto-scroll, manual scroll disables it automatically
- **Service Categories** - Group services with X-Category= in service files
- **Settings Migration** - Automatically migrates from v1 settings format

## Architecture

Process Manager is a **thin wrapper** around systemd. It doesn't spawn processes directly - it controls systemd user services via `systemctl --user` and reads logs from `journalctl`.

**Key benefits:**
- Services survive manager restarts
- Logs persist in journal
- Auto-restart handled by systemd
- Efficient status caching (2-second TTL)

## How It Works

1. **Service Discovery**: Scans `~/.config/systemd/user/*.service` for files with `X-ProcessManager=true`
2. **Status Caching**: Queries systemd once per refresh cycle, caches results for 2 seconds
3. **Log Streaming**: Background thread runs `journalctl -f` to stream new logs
4. **Control**: Uses `systemctl --user start/stop/restart`

## Adding a Service

Add `X-ProcessManager=true` to any systemd user service file to manage it:

```ini
[Unit]
Description=My Application
X-ProcessManager=true
X-Port=8080
X-Category=AI

[Service]
Type=simple
WorkingDirectory=/path/to/app
ExecStart=/usr/bin/python3 main.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

**Required fields:**
- `Description=` - Display name in GUI
- `X-ProcessManager=true` - Opt-in flag

**Optional fields:**
- `X-Port=` - Port number (display only)
- `X-Category=` - Category for grouping (default: "default")

Save to `~/.config/systemd/user/myapp.service`, then:
```bash
systemctl --user daemon-reload
```

Restart process manager to pick up the new service.

## Installation

### Dependencies

```bash
# Ubuntu/Debian
sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-ayatanaappindicator3-0.1
```

### Setup

1. Clone or copy this folder
2. Install the service file:
   ```bash
   cp process-manager.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now process-manager
   ```

3. Or run directly:
   ```bash
   ./run.sh
   ```

## Usage

### GUI Features

- **Process List**: Shows all managed services with:
  - Status (color-coded: green=running, red=failed, yellow=starting)
  - Port, PID, Uptime
  - Memory usage
  - Restart count
- **Start/Stop/Restart**: Action buttons or right-click context menu
- **Logs**: Real-time streaming from journalctl with:
  - Level filtering (DEBUG, INFO, WARN, ERROR)
  - Text search with highlighting
  - Auto-scroll control
  - Per-process or all-processes view
- **System Tray**: Minimize to tray, quick status overview
- **Settings**: Window geometry saved automatically

### Keyboard Shortcuts

- **Ctrl+Q**: Quit application
- **F5**: Refresh status (also available via toolbar)

### Settings File

Settings are stored in `~/.config/process-manager/settings.json`:

```json
{
  "version": 2,
  "window": {
    "width": 1200,
    "height": 700,
    "paned_position": 400,
    "start_hidden": false
  },
  "behavior": {
    "refresh_interval_ms": 2000,
    "log_buffer_size": 10000,
    "auto_scroll_logs": true,
    "close_to_tray": true,
    "minimize_to_tray": true
  },
  "view": {
    "sort_column": "name",
    "sort_order": "asc",
    "show_column_memory": true,
    "show_column_restarts": true
  },
  "main_log_filters": {
    "show_debug": true,
    "show_info": true,
    "show_warn": true,
    "show_error": true
  }
}
```

### Managing the Manager

```bash
# Start
systemctl --user start process-manager

# Stop
systemctl --user stop process-manager

# Restart (e.g., after code changes)
systemctl --user restart process-manager

# View logs
journalctl --user -u process-manager -f
```

## File Structure

```
process-manager/
├── src/
│   ├── main.py              # Entry point, service scanner
│   ├── process_manager.py   # Systemd service wrapper with caching
│   ├── log_streamer.py      # Async log streaming from journalctl
│   ├── gui.py               # GTK interface (modular widgets)
│   └── settings.py          # Settings management with migration
├── icons/                   # Tray icon
├── process-manager.service  # Systemd unit for the manager itself
├── requirements.txt         # Python dependencies
├── run.sh                   # Quick launcher
└── README.md
```

## Performance Improvements

### Before (v1)
- Every 1 second: 3 subprocess calls per process (state, pid, uptime)
- For 5 processes: **15 subprocesses/second**
- Logs loaded once at startup (blocking)
- No caching

### After (v2)
- Every 2 seconds: 1 subprocess call per process (all status in one query)
- For 5 processes: **5 subprocesses/2 seconds = 2.5/second**
- Logs streamed in real-time (background thread)
- 2-second status cache with automatic invalidation

## Example Service Files

### Python with Virtual Environment

```ini
[Unit]
Description=ComfyUI
X-ProcessManager=true
X-Port=8188
X-Category=AI

[Service]
Type=simple
WorkingDirectory=/home/user/ComfyUI
ExecStart=/home/user/ComfyUI/venv/bin/python main.py --listen
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### Node.js Application

```ini
[Unit]
Description=SillyTavern
X-ProcessManager=true
X-Port=8000
X-Category=AI

[Service]
Type=simple
WorkingDirectory=/home/user/SillyTavern
Environment=NODE_ENV=production
ExecStart=/home/user/.nvm/versions/node/v20.0.0/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

### Service with CUDA/GPU Libraries

```ini
[Unit]
Description=Whisper STT Server
X-ProcessManager=true
X-Port=7007
X-Category=AI

[Service]
Type=simple
WorkingDirectory=/home/user/whisper-server
Environment=LD_LIBRARY_PATH=/home/user/.local/lib/python3.12/site-packages/nvidia/cudnn/lib
ExecStart=/usr/bin/python3 server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

## Troubleshooting

### Service won't start
Check logs:
```bash
journalctl --user -u yourservice.service -n 50
```

Common issues:
- Missing dependencies (venv not activated, libraries not found)
- Wrong paths in ExecStart
- Missing environment variables

### Service not showing in GUI
- Verify `X-ProcessManager=true` is in the `[Unit]` section
- Run `systemctl --user daemon-reload`
- Restart process manager

### Logs not appearing
Logs come from journalctl. Check:
```bash
journalctl --user -u yourservice.service -n 10
```

If empty, the service might not be logging to stdout/stderr.

### High CPU usage
- Check `refresh_interval_ms` in settings (default: 2000ms)
- Reduce log buffer size if needed
- Disable auto-scroll when not needed

## Future Improvements

- [ ] Full settings dialog GUI
- [ ] DBus integration (instead of subprocess calls)
- [ ] Notifications on service failures
- [ ] Log export to file
- [ ] Service dependency visualization
- [ ] Resource usage graphs
- [ ] Category-based filtering in UI
