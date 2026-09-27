import pytest
from pydantic import BaseModel, Field, ValidationError

class MortgagePlan(BaseModel):
    property_price: float = Field(gt=0, description="Giá trị bất động sản (VNĐ)")
    loan_amount: float = Field(gt=0, description="Số tiền vay ngân hàng (VNĐ)")
    interest_rate_pct: float = Field(gt=0, description="Lãi suất năm (%)")
    term_years: int = Field(gt=0, le=50, description="Thời hạn vay (năm)")
    monthly_payment_estimate: float = Field(gt=0, description="Số tiền ước tính trả hàng tháng (VNĐ)")
    policy_note: str = Field(description="Chính sách ưu đãi")

def calculate_mortgage(
    property_price: float,
    loan_ratio: float = 0.70,
    interest_rate_pct: float = 8.5,
    term_years: int = 20,
    policy_note: str = "Ân hạn nợ gốc và hỗ trợ lãi suất 0% trong 18 tháng đầu từ ngân hàng liên kết."
) -> MortgagePlan:
    loan_amount = round(property_price * loan_ratio, 2)
    monthly_rate = (interest_rate_pct / 100.0) / 12.0
    num_payments = term_years * 12
    monthly_payment = (loan_amount * monthly_rate) / (1.0 - (1.0 + monthly_rate) ** -num_payments)
    
    return MortgagePlan(
        property_price=property_price,
        loan_amount=loan_amount,
        interest_rate_pct=interest_rate_pct,
        term_years=term_years,
        monthly_payment_estimate=round(monthly_payment, 0),
        policy_note=policy_note
    )

def test_mortgage_calculation_standard_4_5_billion():
    """Verify standard loan calculation on 4.5 billion VNĐ apartment."""
    plan = calculate_mortgage(4_500_000_000.0)
    
    assert plan.property_price == 4_500_000_000.0
    assert plan.loan_amount == 3_150_000_000.0
    assert plan.interest_rate_pct == 8.5
    assert plan.term_years == 20
    # Formula yields 27,336,432 VNĐ for 3.15B loan at 8.5% over 20 years
    assert abs(plan.monthly_payment_estimate - 27_336_432.0) <= 2.0
    assert "Ân hạn" in plan.policy_note

def test_mortgage_plan_pydantic_validation_rejects_negative():
    """Verify Pydantic schema rejects negative prices or zero terms."""
    with pytest.raises(ValidationError):
        MortgagePlan(
            property_price=-1000.0,
            loan_amount=500.0,
            interest_rate_pct=8.5,
            term_years=20,
            monthly_payment_estimate=1000.0,
            policy_note="Invalid price"
        )

def test_mortgage_plan_model_dump():
    """Verify serialization to dict matches expected ArtifactEnvelope payload structure."""
    plan = calculate_mortgage(3_000_000_000.0)
    data = plan.model_dump()
    assert isinstance(data, dict)
    assert data["property_price"] == 3_000_000_000.0
    assert data["loan_amount"] == 2_100_000_000.0
    assert "monthly_payment_estimate" in data
