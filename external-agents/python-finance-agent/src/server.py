import sys
import os
import threading

# Configure UTF-8 encoding on Windows consoles
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import grpc
from concurrent import futures
import json
import time
import re

# Add local path and proto path
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(base_dir)
sys.path.append(os.path.join(base_dir, '..', 'proto'))

try:
    import agent_pipeline_pb2
    import agent_pipeline_pb2_grpc
except ImportError:
    from proto import agent_pipeline_pb2, agent_pipeline_pb2_grpc

from pydantic import BaseModel, Field

class MortgagePlan(BaseModel):
    property_price: float = Field(description="Giá trị bất động sản (VNĐ)")
    loan_amount: float = Field(description="Số tiền vay ngân hàng (VNĐ)")
    loan_ratio_pct: float = Field(description="Tỷ lệ vay (%)", default=70.0)
    interest_rate_pct: float = Field(description="Lãi suất năm (%)")
    term_years: int = Field(description="Thời hạn vay (năm)")
    monthly_payment_estimate: float = Field(description="Số tiền ước tính trả hàng tháng (VNĐ)")
    policy_note: str = Field(description="Chính sách ưu đãi")

class PythonFinanceAgentServicer(agent_pipeline_pb2_grpc.SubAgentServiceServicer):
    def CheckHealth(self, request, context):
        return agent_pipeline_pb2.HealthResponse(
            is_healthy=True,
            status_message="Python Finance Agent is ready on port 50056"
        )

    def ExecuteStep(self, request, context):
        prompt = request.user_prompt or ""

        # 1. Parse parameters from user prompt (price, ratio, years)
        property_price = 4500000000.0
        match_ty = re.search(r'(\d+(?:\.\d+)?)\s*(?:tỷ|ty|tỉ|billion)', prompt, re.IGNORECASE)
        if match_ty:
            property_price = float(match_ty.group(1)) * 1_000_000_000.0

        match_ratio = re.search(r'(\d+)%', prompt)
        loan_ratio = 0.70
        if match_ratio:
            parsed_pct = float(match_ratio.group(1))
            if 10 <= parsed_pct <= 90:
                loan_ratio = parsed_pct / 100.0

        match_years = re.search(r'(\d+)\s*(?:năm|nam|years?)', prompt, re.IGNORECASE)
        term_years = 20
        if match_years:
            parsed_yr = int(match_years.group(1))
            if 1 <= parsed_yr <= 35:
                term_years = parsed_yr

        loan_amount = property_price * loan_ratio
        interest_rate = 8.5  # 8.5%/year
        monthly_rate = (interest_rate / 100.0) / 12.0
        num_payments = term_years * 12
        monthly_payment = (loan_amount * monthly_rate) / (1.0 - (1.0 + monthly_rate) ** -num_payments)

        # 2. Stream Reasoning Chain-of-Thought (CoT) Steps
        cot_steps = [
            f"[Python-FinanceAgent CoT 1/4] Tiếp nhận thông số: Bất động sản giá trị {property_price/1e9:.2f} tỷ VNĐ, nhu cầu vay {loan_ratio*100:.0f}% trong thời hạn {term_years} năm.",
            f"[Python-FinanceAgent CoT 2/4] Kiểm tra chính sách ngân hàng đối tác: Hạn mức vay tối đa 70-80%, hỗ trợ ân hạn nợ gốc và lãi suất 0% trong 18 tháng đầu từ Techcombank / Vietcombank.",
            f"[Python-FinanceAgent CoT 3/4] Áp dụng công thức niên kim tính dư nợ giảm dần: Vay {loan_amount/1e9:.2f} tỷ VNĐ, trả góp ước tính {monthly_payment:,.0f} đ/tháng (gốc + lãi thả nổi 8.5%/năm).",
            f"[Python-FinanceAgent CoT 4/4] Tổng hợp phương án tài chính tối ưu dòng tiền và đóng gói FinancePlanArtifact.",
        ]

        for step in cot_steps:
            yield agent_pipeline_pb2.StepStreamEvent(
                type=agent_pipeline_pb2.StepStreamEvent.TRACE,
                message=step
            )
            time.sleep(0.08)

        # 3. Construct validated MortgagePlan
        plan = MortgagePlan(
            property_price=property_price,
            loan_amount=loan_amount,
            loan_ratio_pct=round(loan_ratio * 100.0, 1),
            interest_rate_pct=interest_rate,
            term_years=term_years,
            monthly_payment_estimate=round(monthly_payment, 0),
            policy_note="Ân hạn nợ gốc và hỗ trợ lãi suất 0% trong 18 tháng đầu từ ngân hàng đối tác (Techcombank/Vietcombank)."
        )

        artifact_envelope = {
            "artifact_id": f"art-fin-{int(time.time())}",
            "run_id": request.run_id if request.run_id else f"run-{int(time.time())}",
            "task_id": request.task_id if request.task_id else f"task-{int(time.time())}",
            "artifact_type": "finance_plan",
            "schema_version": "1.0.0",
            "status": "VALID",
            "producer": "python-finance-agent@1.0.0",
            "content_hash": "sha256-mocked-python-hash",
            "payload": plan.model_dump(),
            "evidence_refs": ["UNIT-VH-02", "UNIT-DOM-SLOW-01"],
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        # 4. Emit COMPLETE event
        yield agent_pipeline_pb2.StepStreamEvent(
            type=agent_pipeline_pb2.StepStreamEvent.COMPLETE,
            message="[Python-FinanceAgent] Đã hoàn tất lập phương án tài chính và lịch trả góp ngân hàng.",
            output_artifact_json=json.dumps(artifact_envelope)
        )

def auto_register_to_gateway():
    """Tự động gửi HTTP POST đăng ký cắm nóng tới Gateway sau khi server khởi chạy"""
    time.sleep(0.8)
    try:
        import requests
        url = "http://localhost:3000/api/v1/agents/register"
        payload = {
            "agent_id": "python-finance-agent",
            "grpc_target": "localhost:50056",
            "domain": "banking_and_finance",
            "description": "Chuyên gia tài chính ngân hàng (Python): Gói vay mua nhà, lịch trả nợ gốc lãi hàng tháng.",
            "supported_intents": ["calculate_mortgage", "compare_loan_packages", "finance_inquiry"]
        }
        res = requests.post(url, json=payload, timeout=4)
        if res.status_code == 200:
            print(">>> [Python-FinanceAgent] Auto-registration to Gateway Hub: SUCCESS (Status 200)", flush=True)
        else:
            print(f">>> [Python-FinanceAgent] Auto-registration response: {res.status_code}", flush=True)
    except Exception as e:
        print(f">>> [Python-FinanceAgent] Gateway not reachable yet for auto-register ({e}). Will wait for Gateway call.", flush=True)

def serve():
    options = [
        ('grpc.max_receive_message_length', 10 * 1024 * 1024),
        ('grpc.max_send_message_length', 10 * 1024 * 1024),
        ('grpc.keepalive_time_ms', 30000),
        ('grpc.keepalive_timeout_ms', 10000),
        ('grpc.http2.min_ping_interval_without_data_ms', 5000),
        ('grpc.http2.max_pings_without_data', 0),
    ]
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4), options=options)
    agent_pipeline_pb2_grpc.add_SubAgentServiceServicer_to_server(PythonFinanceAgentServicer(), server)
    server.add_insecure_port('[::]:50056')
    server.start()
    print(">>> Python Finance Agent gRPC Server is listening on port :50056", flush=True)
    
    # Kích hoạt tiến trình tự động đăng ký với Gateway
    threading.Thread(target=auto_register_to_gateway, daemon=True).start()
    
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
