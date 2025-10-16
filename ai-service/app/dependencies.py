"""
FastAPI Dependencies - Centralized dependency injection for all services
"""

from typing import Optional
from fastapi import Request, HTTPException


# Global service instances (initialized in app.py lifespan)
_model_manager = None
_rag_service = None
_agent_orchestrator = None
_story_manager = None


def set_model_manager(manager):
    """Set global model manager instance"""
    global _model_manager
    _model_manager = manager


def set_rag_service(service):
    """Set global RAG service instance"""
    global _rag_service
    _rag_service = service


def set_agent_orchestrator(orchestrator):
    """Set global agent orchestrator instance"""
    global _agent_orchestrator
    _agent_orchestrator = orchestrator


def set_story_manager(manager):
    """Set global story manager instance"""
    global _story_manager
    _story_manager = manager


# Dependency injection functions for FastAPI
async def get_model_manager(request: Request):
    """Get model manager instance from app state"""
    manager = getattr(request.app.state, "model_manager", None) or _model_manager
    if manager is None:
        raise HTTPException(status_code=503, detail="Model manager not initialized")
    return manager


async def get_rag_service(request: Request):
    """Get RAG service instance from app state"""
    service = getattr(request.app.state, "rag_service", None) or _rag_service
    if service is None:
        raise HTTPException(status_code=503, detail="RAG service not initialized")
    return service


async def get_agent_orchestrator(request: Request):
    """Get agent orchestrator instance from app state"""
    orchestrator = (
        getattr(request.app.state, "agent_orchestrator", None) or _agent_orchestrator
    )
    if orchestrator is None:
        raise HTTPException(
            status_code=503, detail="Agent orchestrator not initialized"
        )
    return orchestrator


async def get_story_manager(request: Request):
    """Get story manager instance from app state"""
    manager = getattr(request.app.state, "story_manager", None) or _story_manager
    if manager is None:
        raise HTTPException(status_code=503, detail="Story manager not initialized")
    return manager


# Synchronous getters for non-FastAPI contexts (e.g., agent tools)
def get_model_manager_sync():
    """Get model manager instance (synchronous)"""
    return _model_manager


def get_rag_service_sync():
    """Get RAG service instance (synchronous)"""
    return _rag_service


def get_agent_orchestrator_sync():
    """Get agent orchestrator instance (synchronous)"""
    return _agent_orchestrator


def get_story_manager_sync():
    """Get story manager instance (synchronous)"""
    return _story_manager
