import sys
import os

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import requests
import time

def register_to_gateway(gateway_url="http://localhost:3000/api/v1/agents/register"):
    payload = {
        "agent_id": "python-finance-agent",
        "grpc_target": "localhost:50056",
        "domain": "banking_and_finance",
        "description": "Chuyên gia tài chính ngân hàng viết bằng Python: Tính toán hạn mức tín dụng, gói vay mua nhà, lịch trả góp ngân hàng hàng tháng.",
        "supported_intents": ["calculate_mortgage", "compare_loan_packages"]
    }
  
    print("Đang gửi yêu cầu Hot-plugging Agent Python lên Gateway TypeScript...", flush=True)
    try:
        response = requests.post(gateway_url, json=payload, timeout=5)
        if response.status_code == 200:
            print(">>> KẾT QUẢ: Hot-plugging thành công! Gateway đã nhận diện Agent Python.", flush=True)
            print(response.json(), flush=True)
            return True
        else:
            print(f"Lỗi đăng ký: {response.status_code} - {response.text}", flush=True)
            return False
    except Exception as e:
        print(f"Không kết nối được tới Gateway: {e}", flush=True)
        return False

if __name__ == '__main__':
    time.sleep(1) # Chờ gRPC server sẵn sàng
    success = register_to_gateway()
    sys.exit(0 if success else 1)
