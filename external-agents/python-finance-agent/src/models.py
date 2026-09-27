"""
external-agents/python-finance-agent/src/models.py
Pydantic models for mortgage & loan calculations
"""

from pydantic import BaseModel, Field

class MortgagePlan(BaseModel):
    property_price: float = Field(description="Giá trị bất động sản (VNĐ)")
    loan_amount: float = Field(description="Số tiền vay ngân hàng (VNĐ)")
    interest_rate_pct: float = Field(description="Lãi suất năm (%)")
    term_years: int = Field(description="Thời hạn vay (năm)")
    monthly_payment_estimate: float = Field(description="Số tiền ước tính trả hàng tháng (VNĐ)")
    policy_note: str = Field(description="Chính sách ưu đãi")
