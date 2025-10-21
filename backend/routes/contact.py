import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from services.email_service import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["contact"])

class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    company: Optional[str] = Field(None, max_length=200)
    subject: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=5000)
    inquiry_type: str = Field(..., alias="inquiryType")

@router.post("/contact")
async def submit_contact(request: ContactRequest):
    try:
        # Determine recipient based on inquiry type
        # inquiry = (request.inquiry_type or '').strip().lower()
        # if inquiry == 'support' or inquiry == 'technical' or inquiry == 'technical support':
        #     recipient = "support@cpaautomation.ai"
        # else:
        #     recipient = "sales@cpaautomation.ai"

        recipient = "sales@cpaautomation.ai"
        subject = f"[Contact] {request.subject} ({request.inquiry_type})"
        # Compose email body with the form details
        body_lines = [
            f"New contact form submission:",
            "",
            f"Name: {request.name}",
            f"Email: {request.email}",
            f"Company: {request.company or '-'}",
            f"Inquiry Type: {request.inquiry_type}",
            f"Subject: {request.subject}",
            "",
            "Message:",
            request.message,
        ]
        body = "\n".join(body_lines)

        sent = email_service.send_email(to_email=recipient, subject=subject, body_text=body, reply_to=str(request.email))
        if not sent:
            logger.error("Contact email failed to send")
            raise HTTPException(status_code=500, detail="Failed to send message. Please try again later.")

        return {"success": True, "message": "Message sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error handling contact form: %s", e)
        raise HTTPException(status_code=500, detail="Unexpected error")
