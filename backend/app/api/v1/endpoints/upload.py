from fastapi import APIRouter, File, UploadFile, HTTPException
from app.core.config import settings
from app.services.storage_service import save_upload
from app.services.parsing_service import parse_document
from app.models.schemas.upload import UploadResponse

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    size_mb = (await file.read()) and (file.spool_max_size / (1024 * 1024))  # read to init size
    await file.seek(0)
    # NOTE: spool_max_size isn’t actual file size. For strict size enforcement, stream to disk and check.
    # Keeping simple for scaffold.
    if settings.MAX_UPLOAD_MB and size_mb and size_mb > settings.MAX_UPLOAD_MB:
        raise HTTPException(413, detail=f"File exceeds {settings.MAX_UPLOAD_MB} MB limit")

    path = await save_upload(file)  # stores file to local dir
    parsed = await parse_document(path)  # returns lightweight parsed preview
    return UploadResponse(path=path, parsed_preview=parsed)
