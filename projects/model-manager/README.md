# Model Manager System

## Problem Statement
Multiple systems (model comparison, evaluators, etc.) need concurrent Ollama inference, but:
- Manual VRAM management causes OOM crashes
- Resource contention leads to failed requests
- No coordination between clients = inefficient GPU usage
- Loading/unloading models manually is error-prone

## Solution
Intelligent VRAM-aware system that acts as a centralized resource scheduler and execution engine. Clients submit jobs via API, system handles all VRAM coordination and Ollama execution automatically.

## Quick Start

### Prerequisites
- Ollama installed and running on localhost:11434
- NVIDIA GPU with nvidia-smi available
- Python 3.8+
- Required Python packages: Flask, requests

### Starting the System

1. **Ensure Ollama is running**:
   ```bash
   # Check Ollama is accessible
   curl http://localhost:11434/api/version
   ```

2. **Start Model Manager** (with HTTP API):
   ```bash
   python3 main.py --http-port 5001 > manager.log 2>&1 &
   ```

3. **Submit test jobs**:
   ```bash
   # Single job
   python3 submit_test_job.py
   
   # Random batch
   python3 submit_test_job.py --random 50
   
   # Spam test
   python3 submit_test_job.py --spam 100
   ```

4. **Monitor activity**:
   ```bash
   tail -f model_manager.log
   ```

## File Structure
```
ModelManager/
├── QUICKSTART.md                # Start here! Quick overview & examples
├── README.md                    # This file - full overview
├── ARCHITECTURE.md              # Detailed design & specifications
├── main.py                      # Main orchestrator with HTTP API
├── api.py                       # Internal API interface
├── queue_manager.py             # Job queue and organization
├── vram_scheduler.py            # VRAM-aware scheduling
├── execution_engine.py          # Ollama execution engine
├── resource_monitor.py          # GPU/VRAM monitoring via nvidia-smi
├── model_registry.py            # Model metadata (10 small models)
├── models.py                    # Data models (Job, Result, etc)
├── config.py                    # Configuration
├── logger.py                    # Centralized logging
├── submit_test_job.py           # Job submission CLI tool
└── test_integration.py          # Integration tests
```

## Current Status

**Implementation Status**: Production Ready
- ✅ HTTP API (Flask on port 5001)
- ✅ Job queue and scheduling
- ✅ VRAM-aware scheduling logic
- ✅ Resource monitoring via nvidia-smi and Ollama API
- ✅ Model registry (10 small models optimized for testing)
- ✅ Logging system
- ✅ Execution Engine with full Ollama integration
- ✅ Automatic model loading/unloading via Ollama API

## Architecture Overview

Six core components with strict boundaries: HTTP API (external interface), Internal API (client interface), Queue Manager (job storage and batching), VRAM Scheduler (load/unload decisions), Execution Engine (Ollama executor), Resource Monitor (VRAM state reader via nvidia-smi and Ollama), Model Registry (metadata store). 

**Data flow**: HTTP clients → Flask API → Internal API → Queue Manager → Scheduler → Execution Engine

**Control flow**: Scheduler reads from Resource Monitor and Model Registry, creates execution plans for Execution Engine. Background loop runs every 100ms checking for new jobs.

## Components

### 1. HTTP API (`main.py` - Flask Server)
**Status**: ✅ Implemented
**Port**: 5001
**Endpoints**:
- `POST /api/submit` - Submit new job
- `GET /api/job/<job_id>` - Get job status/result
- `GET /api/stats` - System statistics
- `GET /api/health` - Health check

### 2. Smart Queue Manager (`queue_manager.py`)
**Status**: ✅ Implemented
**Responsibility**: Accept jobs, organize by model, apply priority and fairness
**Input**: Job requests from internal API
**Output**: Organized job batches for scheduler
**Features**: Priority queues (HIGH, NORMAL, LOW), model-based grouping

### 3. VRAM Scheduler (`vram_scheduler.py`)
**Status**: ✅ Implemented
**Responsibility**: Track VRAM, decide which models to load/unload
**Input**: Job batches from queue, current VRAM state from Resource Monitor
**Output**: Load/unload commands, ready-to-execute job lists
**Features**: Fits as many models as possible into 24GB VRAM

### 4. Execution Engine (`execution_engine.py`)
**Status**: ✅ Implemented
**Responsibility**: Execute inference requests via Ollama API, collect results
**Input**: Jobs with loaded models
**Output**: Completed job results
**Features**: Real Ollama API calls, model loading/unloading, concurrent execution

### 5. Resource Monitor (`resource_monitor.py`)
**Status**: ✅ Implemented
**Responsibility**: Track GPU VRAM and loaded Ollama models
**Input**: System state queries
**Output**: Current VRAM usage (via nvidia-smi), loaded models list (via Ollama)
**Features**: Direct nvidia-smi integration, Ollama /api/ps querying

### 6. Model Registry (`model_registry.py`)
**Status**: ✅ Implemented
**Responsibility**: Store model metadata (VRAM requirements, capabilities)
**Input**: Model queries
**Output**: Model information
**Features**: 10 small models (90MB to 2.2GB) for efficient testing

### 7. API Interface (`api.py`)
**Status**: ✅ Implemented
**Responsibility**: External interface for submitting jobs and retrieving results
**Input**: Client job submissions
**Output**: Job IDs, status, results

## Data Flow

### Complete Job Lifecycle
```
1. Client submits job
   → API.submit() validates & assigns job_id
   → QueueManager.enqueue() stores job (status: pending)
   
2. Background scheduler loop (continuous)
   → QueueManager.get_next_batch() groups jobs by model
   → VRAMScheduler.schedule() analyzes resources & creates execution plan
   
3. Execution plan specifies:
   → Which models to unload (free VRAM)
   → Which models to load (prepare for inference)
   → Which jobs to execute (status: queued → running)
   
4. ExecutionEngine executes plan
   → Loads/unloads models via Ollama API
   → Runs inference concurrently (multiple jobs per model)
   → Collects results
   
5. Results stored (status: complete/failed)
   → Client polls API.get_result(job_id)
   → Returns output/error
```

### Decision Flow: When Does Scheduler Act?
```
Scheduler Loop (every 100ms):
  ├─ Check queue → Any pending jobs?
  │   └─ No → Sleep, continue
  │   └─ Yes → Proceed
  │
  ├─ Group jobs by model (QueueManager)
  │   └─ {model_a: [job1, job2], model_b: [job3]}
  │
  ├─ Check VRAM (ResourceMonitor)
  │   └─ 24GB total, 18GB used, 6GB free
  │
  ├─ Make load/unload decisions (VRAMScheduler)
  │   ├─ model_a needs 4GB → Can load (6GB available)
  │   └─ model_b needs 8GB → Must unload idle model first
  │
  └─ Execute plan (ExecutionEngine)
      └─ Load → Execute → Collect results
```

## Available Models

The system is configured with 10 small models optimized for testing and rapid scheduling:

| Model | Size | Est. VRAM | Capabilities |
|-------|------|-----------|--------------|
| smollm:360m | 0.2GB | ~0.24GB | text |
| all-minilm:latest | 0.09GB | ~0.11GB | embedding |
| nomic-embed-text:latest | 0.27GB | ~0.33GB | embedding |
| qwen2.5:0.5b | 0.5GB | ~0.61GB | text |
| tinyllama:1.1b | 0.6GB | ~0.73GB | text |
| smollm:1.7b | 1.0GB | ~1.21GB | text |
| llama3.2:1b | 1.3GB | ~1.57GB | text |
| gemma:2b | 1.4GB | ~1.70GB | text |
| qwen2.5:1.5b | 1.5GB | ~1.82GB | text |
| phi3:mini | 2.2GB | ~2.66GB | text |

*All 10 models can fit in ~11GB VRAM simultaneously*
*VRAM estimates include 1.3x multiplier for overhead*

**Note**: These small models enable rapid testing of scheduling logic. To use larger production models, update the model_registry.py catalog.

## HTTP API Reference

### Submit Job
```bash
POST /api/submit
Content-Type: application/json

{
  "model": "qwen2.5:7b",
  "prompt": "Analyze this manufacturing process",
  "priority": "high",  # optional: "low", "normal", "high"
  "images": [],        # optional: for vision models
  "metadata": {}       # optional: custom metadata
}

Response: {"job_id": "uuid", "status": "submitted"}
```

### Get Job Status
```bash
GET /api/job/<job_id>

Response: {
  "job_id": "uuid",
  "status": "complete",  # pending, queued, running, complete, failed
  "model": "qwen2.5:7b",
  "result": "...",       # when complete
  "submitted_at": "...",
  "completed_at": "..."
}
```

### Get System Stats
```bash
GET /api/stats

Response: {
  "running": true,
  "queue": {
    "total_jobs": 60,
    "by_status": {"complete": 60}
  },
  "resources": {
    "vram": {"total": 25769803776, "used": 0, "free": 25769803776},
    "loaded_models": []
  }
}
```

## Testing Tools

### submit_test_job.py
Command-line tool for submitting test jobs:

```bash
# Single job
python3 submit_test_job.py

# Predefined batch (4 jobs)
python3 submit_test_job.py --batch

# Random jobs with specific count
python3 submit_test_job.py --random 50

# Spam mode (no result checking)
python3 submit_test_job.py --spam 100

# With delay between submissions
python3 submit_test_job.py --random 50 --delay 0.5

# Skip result checking
python3 submit_test_job.py --random 20 --no-check
```

## Development Status

### ✅ Production Ready
- HTTP API server with Flask
- Job queue with priority support
- VRAM-aware scheduler with resource planning
- Resource monitoring via nvidia-smi and Ollama
- Model registry with 10 small test models
- Full Ollama integration in Execution Engine
- Automatic model loading/unloading
- Logging system
- Integration tests
- Job submission CLI tool

### 🔲 Future Enhancements
- Advanced scheduling strategies (preloading, affinity)
- Performance metrics and monitoring dashboard
- Persistent job storage (database)
- Job result caching
- Multi-GPU support
- Model warm pools

## Component Boundaries

### Queue Manager ONLY:
- Accept jobs
- Store jobs in memory/database
- Organize by priority and model
- Provide job batches to scheduler

### VRAM Scheduler ONLY:
- Query ResourceMonitor for VRAM state
- Query ModelRegistry for model requirements
- Decide load/unload strategy
- Tell ExecutionEngine which jobs to run

### Execution Engine ONLY:
- Load models via Ollama API
- Send inference requests
- Collect results
- Update job status
- Unload models when instructed

### Resource Monitor ONLY:
- Poll nvidia-smi for VRAM usage
- Query Ollama /api/ps for loaded models
- Return current state snapshots (no decisions)

### Model Registry ONLY:
- Store model metadata
- Return model information
- Learn and cache actual VRAM usage

### API ONLY:
- Handle client requests
- Validate input
- Return job IDs and results
- No scheduling logic

## Logging

All system activity is logged to `model_manager.log`:

```bash
# Watch logs in real-time
tail -f model_manager.log

# Filter by component
tail -f model_manager.log | grep QUEUE
tail -f model_manager.log | grep SCHEDULER
tail -f model_manager.log | grep ENGINE
```

Log format: `[HH:MM:SS.mmm] [COMPONENT] Message`

Components: SYSTEM, API, QUEUE, SCHEDULER, ENGINE, MONITOR, REGISTRY

## Configuration

Edit `config.py` to customize:

```python
# Ollama settings
OLLAMA_BASE_URL = "http://localhost:11434"

# VRAM settings
VRAM_SAFETY_MARGIN_MB = 1024  # Reserve 1GB
VRAM_ESTIMATION_MULTIPLIER = 1.3

# Scheduler
SCHEDULER_LOOP_INTERVAL = 0.1  # 100ms
SCHEDULER_STRATEGY = "demand_based"

# Model management
MODEL_KEEP_ALIVE = 300  # 5 minutes
MAX_CONCURRENT_PER_MODEL = 20

# Queue settings
QUEUE_MAX_SIZE = 1000
```

## Client Integration Examples

### Python HTTP Client
```python
import requests
import time

# Submit job
response = requests.post('http://localhost:5001/api/submit', json={
    'model': 'qwen2.5:1.5b',
    'prompt': 'Analyze quality metrics',
    'priority': 'high'
})
job_id = response.json()['job_id']

# Poll for result
while True:
    result = requests.get(f'http://localhost:5001/api/job/{job_id}').json()
    if result['status'] in ['complete', 'failed']:
        break
    time.sleep(1)

if result['status'] == 'complete':
    print(result['result'])
else:
    print(f"Job failed: {result.get('error')}")
```

### Use Cases

**Model Comparison System**
- Submits batch of test jobs (10 images × 5 models = 50 jobs)
- Different priorities for different models
- Collects all results for comparison

**Manufacturing Evaluator**
- Submits high-priority evaluation jobs
- Uses vision models for defect detection
- Gets rapid results for quality control

**Batch Processing**
- Submits hundreds of jobs overnight
- System automatically manages VRAM
- Processes jobs efficiently without OOM errors
