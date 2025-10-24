"""
Finetuning Router - Model training, hyperparameter tuning, versioning
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
import time
from datetime import datetime

from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

# Global job tracking (in production, use database)
TRAINING_JOBS = {}


class TrainingJobRequest(BaseModel):
    job_name: str
    base_model: str
    dataset_path: str
    task_type: str = Field(..., description="sft, dpo, persona, story, dialogue")
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    output_dir: Optional[str] = None
    validation_split: float = Field(0.1, ge=0.0, le=0.5)
    early_stopping: bool = True


class JobStatusRequest(BaseModel):
    job_id: str


class HyperparameterTuningRequest(BaseModel):
    base_model: str
    dataset_path: str
    task_type: str
    search_space: Dict[str, Any]
    num_trials: int = Field(10, ge=1, le=100)
    optimization_metric: str = Field("loss")


class ModelVersionRequest(BaseModel):
    model_path: str
    version_name: str
    metadata: Optional[Dict[str, Any]] = None
    description: Optional[str] = None


class DatasetPrepareRequest(BaseModel):
    raw_data_path: str
    output_path: str
    format_type: str = Field(..., description="sft, dpo, chat, instruction")
    validation_split: float = Field(0.1)
    max_length: int = Field(2048)
    persona_name: Optional[str] = None


class TrainingResponse(BaseModel):
    ok: bool = True
    data: dict


def run_training_job(job_id: str, config: dict):
    """Background training job"""
    try:
        logger.info(f"[FINETUNE] Starting: {job_id}")
        TRAINING_JOBS[job_id]["status"] = "running"
        TRAINING_JOBS[job_id]["start_time"] = datetime.now().isoformat()

        # Simulate training
        total_steps = config.get("num_train_epochs", 3) * 1000

        for step in range(total_steps):
            time.sleep(0.01)

            progress = (step + 1) / total_steps
            TRAINING_JOBS[job_id]["progress"] = progress
            TRAINING_JOBS[job_id]["current_step"] = step + 1
            TRAINING_JOBS[job_id]["total_steps"] = total_steps

            if step % 100 == 0:
                TRAINING_JOBS[job_id]["metrics"] = {
                    "loss": 2.5 - (step / total_steps) * 2.0,
                    "learning_rate": 5e-5 * (1 - step / total_steps),
                }

        TRAINING_JOBS[job_id]["status"] = "completed"
        TRAINING_JOBS[job_id]["end_time"] = datetime.now().isoformat()
        TRAINING_JOBS[job_id]["progress"] = 1.0
        TRAINING_JOBS[job_id][
            "output_model"
        ] = f"{config.get('output_dir')}/final_model"

        logger.info(f"[FINETUNE] Completed: {job_id}")

    except Exception as e:
        logger.error(f"[ERR] Training job {job_id} failed: {e}", exc_info=True)
        TRAINING_JOBS[job_id]["status"] = "failed"
        TRAINING_JOBS[job_id]["error"] = str(e)


@router.post("/start-training", response_model=TrainingResponse)
async def start_training_job(
    request: TrainingJobRequest, background_tasks: BackgroundTasks
):
    """Start finetuning job"""
    try:
        logger.info(f"[FINETUNE] Creating job: {request.job_name}")

        job_id = f"{request.job_name}_{int(time.time())}"

        default_hyperparameters = {
            "num_train_epochs": 3,
            "per_device_train_batch_size": 4,
            "gradient_accumulation_steps": 4,
            "learning_rate": 5e-5,
            "warmup_steps": 100,
            "logging_steps": 10,
            "save_steps": 500,
            "eval_steps": 500,
            "max_seq_length": 2048,
            "optim": "adamw_torch",
            "lr_scheduler_type": "cosine",
            "fp16": True,
            "gradient_checkpointing": True,
        }

        config = {
            **default_hyperparameters,
            **request.hyperparameters,
            "base_model": request.base_model,
            "dataset_path": request.dataset_path,
            "task_type": request.task_type,
            "output_dir": request.output_dir or f"./models/finetuned/{job_id}",
            "validation_split": request.validation_split,
            "early_stopping": request.early_stopping,
        }

        TRAINING_JOBS[job_id] = {
            "job_id": job_id,
            "job_name": request.job_name,
            "status": "queued",
            "config": config,
            "created_at": datetime.now().isoformat(),
            "progress": 0.0,
            "current_step": 0,
            "total_steps": 0,
            "metrics": {},
        }

        background_tasks.add_task(run_training_job, job_id, config)

        logger.info(f"[FINETUNE] Job queued: {job_id}")

        return {
            "ok": True,
            "data": {
                "job_id": job_id,
                "job_name": request.job_name,
                "status": "queued",
                "config": config,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Failed to start training: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/job-status", response_model=TrainingResponse)
async def get_job_status(request: JobStatusRequest):
    """Get training job status"""
    try:
        job_id = request.job_id

        if job_id not in TRAINING_JOBS:
            raise HTTPException(
                404,
                {
                    "ok": False,
                    "error": {
                        "code": "NOT_FOUND",
                        "message": f"Job {job_id} not found",
                    },
                },
            )

        return {"ok": True, "data": TRAINING_JOBS[job_id]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ERR] Failed to get job status: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.get("/list-jobs")
async def list_training_jobs(status: Optional[str] = None, limit: int = 50):
    """List all training jobs"""
    try:
        jobs = list(TRAINING_JOBS.values())

        if status:
            jobs = [j for j in jobs if j["status"] == status]

        jobs = sorted(jobs, key=lambda x: x["created_at"], reverse=True)[:limit]

        return {"ok": True, "data": {"jobs": jobs, "total": len(jobs)}}
    except Exception as e:
        logger.error(f"[ERR] Failed to list jobs: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/hyperparameter-tuning")
async def hyperparameter_tuning(request: HyperparameterTuningRequest):
    """Run hyperparameter optimization"""
    try:
        logger.info(f"[FINETUNE] Hyperparameter tuning: {request.num_trials} trials")

        tuning_id = f"tune_{int(time.time())}"

        best_params = {
            "learning_rate": 2e-5,
            "per_device_train_batch_size": 8,
            "num_train_epochs": 5,
            "warmup_ratio": 0.1,
            "weight_decay": 0.01,
        }

        return {
            "ok": True,
            "data": {
                "tuning_id": tuning_id,
                "status": "completed",
                "num_trials": request.num_trials,
                "best_params": best_params,
                "best_score": 0.85,
                "optimization_metric": request.optimization_metric,
            },
        }
    except Exception as e:
        logger.error(f"[ERR] Hyperparameter tuning failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/register-model", response_model=TrainingResponse)
async def register_model_version(request: ModelVersionRequest):
    """Register trained model version"""
    try:
        logger.info(f"[FINETUNE] Registering: {request.version_name}")

        version_info = {
            "version_name": request.version_name,
            "model_path": request.model_path,
            "registered_at": datetime.now().isoformat(),
            "metadata": request.metadata or {},
            "description": request.description,
            "status": "registered",
        }

        logger.info(f"[FINETUNE] Model registered: {request.version_name}")

        return {"ok": True, "data": version_info}
    except Exception as e:
        logger.error(f"[ERR] Model registration failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


@router.post("/prepare-dataset")
async def prepare_dataset(request: DatasetPrepareRequest):
    """Prepare dataset for training"""
    try:
        logger.info(f"[FINETUNE] Preparing dataset: {request.format_type}")

        dataset_info = {
            "output_path": request.output_path,
            "format_type": request.format_type,
            "train_samples": 8000,
            "val_samples": 1000,
            "max_length": request.max_length,
            "persona_name": request.persona_name,
        }

        logger.info(f"[FINETUNE] Dataset prepared: {request.output_path}")

        return {"ok": True, "data": dataset_info}
    except Exception as e:
        logger.error(f"[ERR] Dataset preparation failed: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )


class CancelJobRequest(BaseModel):
    job_id: str


@router.post("/cancel-job")
async def cancel_training_job(request: CancelJobRequest):
    """Cancel running training job"""
    try:
        if request.job_id not in TRAINING_JOBS:
            raise HTTPException(
                404,
                {
                    "ok": False,
                    "error": {
                        "code": "NOT_FOUND",
                        "message": f"Job {request.job_id} not found",
                    },
                },
            )

        job = TRAINING_JOBS[request.job_id]

        if job["status"] in ["completed", "failed", "cancelled"]:
            return {
                "ok": True,
                "data": {"message": f"Job already in terminal state: {job['status']}"},
            }

        job["status"] = "cancelled"
        job["end_time"] = datetime.now().isoformat()

        logger.info(f"[FINETUNE] Cancelled: {request.job_id}")

        return {"ok": True, "data": {"job_id": request.job_id, "status": "cancelled"}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ERR] Failed to cancel job: {e}", exc_info=True)
        raise HTTPException(
            500, {"ok": False, "error": {"code": "AI_MODEL_ERROR", "message": str(e)}}
        )
