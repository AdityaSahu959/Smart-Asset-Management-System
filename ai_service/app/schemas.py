from typing import Annotated, Literal
import math
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator
from .config import DIMENSIONS, EMBEDDING_VERSION

Text = Annotated[str, Field(min_length=1, max_length=5000)]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True)

class TriageRequest(StrictModel):
    description: Text
    request_id: Annotated[str, Field(min_length=1, max_length=100)]

class ResolutionRequest(StrictModel):
    ticket_id: Annotated[int, Field(gt=0)]
    issue_description: Text
    resolution_summary: Annotated[str, Field(min_length=1, max_length=10000)]
    status: Literal["Closed"]
    verified: Literal[True]
    source_type: Literal["real", "synthetic"]

class HistoricalTicket(ResolutionRequest):
    source_type: Literal["real"]
    vector: Annotated[list[FiniteFloat], Field(min_length=DIMENSIONS, max_length=DIMENSIONS)]
    model_version: Literal[EMBEDDING_VERSION]

    @field_validator("vector")
    @classmethod
    def validate_norm(cls, value):
        norm = math.sqrt(sum(number * number for number in value))
        if abs(norm - 1.0) > 0.01:
            raise ValueError("Vector must be L2-normalized")
        return value

class RecommendRequest(StrictModel):
    description: Text
    historical_tickets: Annotated[list[HistoricalTicket], Field(max_length=200)]
    min_similarity: Annotated[FiniteFloat, Field(ge=0.0, le=1.0)] = 0.45

