from app.models.user import User


def get_all_users(skip=0, limit=100):
    return []


def create_user(name, email):
    return User(name=name, email=email)


def get_user_by_id(user_id):
    return None
