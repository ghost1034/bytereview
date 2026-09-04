import logging
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from firmcrm.core.errors import DomainError

logger = logging.getLogger('firmcrm')

class FirmCrmValidationIssue(BaseModel):
    loc: str
    msg: str
    type: str


class FirmCrmError(BaseModel):
    detail: str
    code: str
    errors: list[FirmCrmValidationIssue] | None = None


class FirmCrmRoute(APIRoute):
    def __init__(self, *args, **kwargs):
        responses = {status: {"model": FirmCrmError} for status in (400, 403, 404, 409, 422)}
        responses.update(kwargs.pop("responses", None) or {})
        super().__init__(*args, responses=responses, **kwargs)

    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request: Request):
            try:
                response = await original(request)
                response.headers['Cache-Control'] = 'no-store'
                return response
            except RequestValidationError as exc:
                errors = [{"loc": ".".join(str(x) for x in e["loc"] if x != "body"), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
                return JSONResponse({"detail": "Validation failed: " + "; ".join(f"{e['loc']}: {e['msg']}" for e in errors[:5]), "code": "validation_error", "errors": errors}, status_code=422, headers={"Cache-Control": "no-store"})
            except DomainError as exc:
                logger.info("CRM request rejected firm=%s user=%s code=%s", getattr(request.state, "firmcrm_firm_id", None), getattr(request.state, "firmcrm_user_id", None), exc.code)
                return JSONResponse({'detail': exc.message, 'code': exc.code}, status_code=exc.status_code, headers={'Cache-Control':'no-store'})
            except IntegrityError:
                return JSONResponse({'detail':'A referenced record is unavailable or the change conflicts with an existing record.', 'code':'conflict'}, status_code=409)
        return handler

