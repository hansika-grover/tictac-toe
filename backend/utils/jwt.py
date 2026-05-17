from datetime import timedelta, timezone, datetime
import jwt
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi import Depends, HTTPException, status

ACCESS_TOKEN_EXPIRES_MINUTES = 15
ALGORITHM = "HS256"


load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
SECRET_KEY = os.getenv("SECRET_KEY")

security = HTTPBearer()


def create_jwt(uid):
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRES_MINUTES
    )
    to_encode = {"sub": uid, "exp": expires_at}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has no subject"
        )
    return uid


def get_uid_from_ws_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    return payload.get("sub")
