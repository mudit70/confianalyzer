from fastapi import APIRouter
from app.services.user_service import get_all_users, create_user, get_user_by_id

router = APIRouter()


@router.get("/users")
async def list_users(skip: int = 0, limit: int = 100):
    return get_all_users(skip, limit)


@router.post("/users")
async def add_user(name: str, email: str):
    return create_user(name, email)


@router.get("/users/{user_id}")
async def get_user(user_id: int):
    return get_user_by_id(user_id)
