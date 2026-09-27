# 🌟 VDaAgent Distributed Multi-Agent Platform PoC

Hệ thống Multi-Agent phân tán mô phỏng điều tra và phân tích bất động sản, giao tiếp qua **gRPC / Protocol Buffers**, kiến trúc **DAG Pipeline**, cơ chế **Hot-plugging Remote Agent** không downtime, **Chatbot độc lập & Suy luận Chain-of-Thought (CoT)** cho từng Agent, cùng giao diện tương tác trực quan hai chiều.

---

## 📋 Mục lục

1. [Tổng quan Kiến trúc](#-tổng-quan-kiến-trúc)
2. [Yêu cầu Môi trường](#-yêu-cầu-môi-trường-prerequisites)
3. [Cài đặt & Khởi tạo cho Người mới](#-cài-đặt--khởi-tạo-cho-người-mới)
4. [Hướng dẫn Khởi chạy](#-hướng-dẫn-khởi-chạy)
5. [Cắm nóng Agent thứ 7 (Python Finance Agent)](#-cắm-nóng-agent-thứ-7-python-finance-agent)
6. [Kịch bản Kiểm thử Tự động](#-kịch-bản-kiểm-thử-tự-động)
7. [Hướng dẫn Sử dụng Giao diện Web](#-hướng-dẫn-sử-dụng-giao-diện-web)
8. [Xử lý Sự cố Thường gặp (Troubleshooting)](#-xử-lý-sự-cố-thường-gặp-troubleshooting)

---

## 🏗 Tổng quan Kiến trúc

Hệ thống được xây dựng theo mô hình Monorepo với các dịch vụ độc lập:

| Dịch vụ / Agent | Cổng (Port) | Giao thức | Chức năng chính |
| :--- | :--- | :--- | :--- |
| **`apps/gateway`** | **3000** | HTTP / SSE | API Gateway, gRPC Hub, DAG Orchestrator, Dynamic Router & Session Store |
| **`apps/web`** | **5173** | HTTP | Giao diện React 19 + Vite: Chatbox đa agent, Stepper, Inspector hai chiều, Recharts |
| **`data-agent`** | **50051** | gRPC | Truy vấn dữ liệu căn hộ bán chậm (DOM > 90 ngày) từ SQLite Mock Warehouse |
| **`compare-agent`** | **50052** | gRPC | Đối chuẩn thị trường phân khu Sapphire, đo lường độ lệch giá |
| **`insight-agent`** | **50053** | gRPC | Phân tích 3 nguyên nhân gốc rễ (Root Cause) gắn liền với bằng chứng xác thực |
| **`chart-agent`** | **50054** | gRPC | Sinh cấu hình 3 biểu đồ Recharts (DOM 90d, Giá Sapphire, Tương quan Giá-DOM) |
| **`report-agent`** | **50055** | gRPC | Tổng hợp báo cáo điều tra 6 phần chuẩn PRD kèm liên kết bằng chứng |
| **`python-finance-agent`** | **50056** | gRPC | **Agent cắm nóng (Python)**: Tính toán phương án vay mua nhà, lịch trả góp gốc lãi |

---

## 💻 Yêu cầu Môi trường (Prerequisites)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

1. **Node.js**: Phiên bản `>= 22.0.0` ([Tải Node.js](https://nodejs.org/))
2. **pnpm**: Phiên bản `>= 9.0.0` (Khuyên dùng pnpm v11)
   ```bash
   corepack enable
   corepack prepare pnpm@latest --activate
   # Hoặc: npm install -g pnpm
   ```
3. **Python**: Phiên bản `>= 3.11` (Dành cho Python Finance Agent)
   - Đảm bảo đã tích chọn *"Add python.exe to PATH"* khi cài đặt trên Windows.
4. **Hệ điều hành**: Windows 10/11 (PowerShell), macOS hoặc Linux.

---

## 🚀 Cài đặt & Khởi tạo cho Người mới

Thực hiện tuần tự 4 bước sau để khởi tạo dự án từ đầu:

### Bước 1: Mở Terminal tại thư mục dự án
```bash
cd vdagent-demo
```

### Bước 2: Tạo file cấu hình môi trường `.env`
Sao chép từ file `.env.example`:
```bash
# Windows PowerShell:
Copy-Item .env.example .env

# Linux / macOS:
cp .env.example .env
```
Mở file `.env` và điền khóa API (nếu có sử dụng mô hình LLM):
```env
OPENAI_API_KEY=your_actual_api_key_here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=deepseek/deepseek-v4-flash-0731
LLM_TIMEOUT_S=120
```
*(Lưu ý: Hệ thống có sẵn bộ suy luận mẫu xác thực chuẩn PRD, bạn vẫn có thể chạy và trải nghiệm đầy đủ mà không bắt buộc có API key ngay lập tức).*

### Bước 3: Cài đặt các gói phụ thuộc (Dependencies)
```bash
pnpm install
```

### Bước 4: Thiết lập môi trường ảo Python cho Finance Agent
```bash
# Di chuyển vào thư mục python agent
cd external-agents/python-finance-agent

# Tạo môi trường ảo venv
python -m venv venv

# Cài đặt thư viện Python (grpcio, pydantic, requests...)
# Trên Windows PowerShell:
.\venv\Scripts\pip install -r requirements.txt

# Trên Linux / macOS:
./venv/bin/pip install -r requirements.txt

# Quay lại thư mục gốc dự án
cd ../..
```

---

## ⚡ Hướng dẫn Khởi chạy

### Cách 1: Khởi chạy toàn bộ hệ thống bằng 1 lệnh duy nhất (Khuyên dùng)

Tại thư mục gốc dự án, chạy lệnh:
```bash
pnpm start
```
Lệnh này sẽ tự động khởi động song song:
1. 5 Core gRPC Sub-agents (Ports `50051`, `50052`, `50053`, `50054`, `50055`)
2. API Gateway & DAG Orchestrator (Port `3000`)
3. React Web Dashboard (Port `5173`)

Sau khi hiển thị thông báo `TOÀN BỘ HỆ THỐNG ĐÃ SẴN SÀNG`, bạn mở trình duyệt và truy cập:
👉 **http://localhost:5173**

---

### Cách 2: Khởi chạy từng tiến trình riêng biệt (Để xem log chi tiết)

Mở 3 cửa sổ terminal riêng biệt:

- **Terminal 1 (5 Core Agents)**:
  ```bash
  pnpm start:agents
  ```
- **Terminal 2 (API Gateway)**:
  ```bash
  pnpm start:gateway
  ```
- **Terminal 3 (Web UI)**:
  ```bash
  pnpm start:web
  ```

---

## 🔌 Cắm nóng Agent thứ 7 (Python Finance Agent)

Agent thứ 7 được viết bằng **Python** và hoạt động như một microservice hoàn toàn độc lập với Core TypeScript. 

Để thử nghiệm tính năng cắm nóng thời gian thực (**Zero-downtime Autonomous Hot-plugging**):

1. Đảm bảo hệ thống chính đang chạy (`http://localhost:5173`).
2. Mở một cửa sổ Terminal mới và chạy:
   ```powershell
   # Trên Windows PowerShell:
   cd external-agents/python-finance-agent
   .\run.ps1
   ```
   *(Hoặc chạy thủ công: `.\venv\Scripts\python src/server.py`)*

3. **Quan sát điều kỳ diệu**:
   - Agent Python khởi động gRPC server trên Port `50056`.
   - Một tiến trình nền tự động gửi yêu cầu đăng ký `POST /api/v1/agents/register` tới Gateway.
   - Gateway tự động tích hợp Agent vào Dynamic Router và cập nhật trạng thái.
   - Trên thanh Sidebar của Web UI, mục **Python Finance Agent** lập tức xuất hiện ở trạng thái **Online** mà không cần người dùng bấm nút cắm hay tải lại trang (F5)!
   - Giờ đây, bạn có thể chat trực tiếp với Python Finance Agent hoặc hỏi các câu liên quan đến vay vốn, hệ thống sẽ tự động định tuyến chuẩn xác.

---

## 🧪 Kịch bản Kiểm thử Tự động

Dự án cung cấp kịch bản kiểm thử toàn trình End-to-End (E2E) tự động hóa 100%:
```bash
pnpm test:demo
```
Kịch bản sẽ tự động:
1. Gửi câu hỏi nghiệp vụ BĐS, lắng nghe luồng SSE và kiểm tra tính hợp lệ của toàn bộ artifacts từ 5 Core Agents.
2. Khởi chạy tiến trình Python Finance Agent và mô phỏng hot-plugging.
3. Gửi câu hỏi tài chính và xác minh dynamic routing sang Python qua gRPC.

Để kiểm tra tính hợp lệ của TypeScript toàn bộ dự án:
```bash
pnpm typecheck
```

---

## 🖥 Hướng dẫn Sử dụng Giao diện Web

Khi mở **http://localhost:5173**, bạn sẽ thấy giao diện 3 cột:

1. **Cột Trái (Sidebar - Danh sách Agent)**:
   - Hiển thị Orchestrator và tất cả Sub-agents.
   - Khi có tác vụ đang chạy, biểu tượng của agent tương ứng sẽ chuyển sang **Loading xoay tròn** (`Loader2 animate-spin`), giúp bạn dễ dàng theo dõi agent nào đang làm việc.
2. **Cột Giữa (Khung Chat & Suy luận Chain-of-Thought)**:
   - **Orchestrator Chat**: Bấm vào gợi ý câu hỏi *"Điều tra căn hộ bán chậm phân khu Sapphire"*. Quá trình thực thi sẽ hiển thị phân tách theo từng agent (`[data-agent]`, `[compare-agent]`, `[insight-agent]`, etc.) kèm nút chuyển nhanh sang chatbox riêng.
   - **Sub-Agent Chat**: Bấm chọn bất kỳ agent nào (ví dụ `Data Agent`, `Insight Agent`, hay `Python Finance Agent`) để vào chatbox riêng. Bạn sẽ thấy quá trình suy luận **Reasoning Chain-of-Thought (CoT)** từng bước và kết quả phân tích chuyên biệt.
   - **Lưu lịch sử chat**: Toàn bộ nội dung trao đổi được lưu trữ liên tục; bạn có thể tải lại trang (F5) mà không lo mất dữ liệu.
3. **Cột Phải (Inspector Điều hướng Hai chiều)**:
   - **Bằng chứng (Evidence)**: Hiển thị danh mục tổng quan tất cả căn hộ bán chậm và căn hộ đối chuẩn. Bấm vào từng căn để xem chi tiết bằng chứng và bấm `< Quay lại danh mục bằng chứng` để quay lại danh mục đầy đủ.
   - **Báo cáo (Report)**: Đọc báo cáo điều tra 6 phần hoàn chỉnh chuẩn PRD, tích hợp sẵn **3 biểu đồ Recharts tương tác** (DOM 90d, Giá Sapphire, Tương quan Giá-DOM). Bạn có thể click trực tiếp vào từng cột trên biểu đồ để xem ngay bằng chứng căn hộ tương ứng.

---

## 🛠 Xử lý Sự cố Thường gặp (Troubleshooting)

### 1. Lỗi cổng mạng bị chiếm dụng (Port already in use)
Nếu gặp lỗi `EADDRINUSE: address already in use` trên port 3000 hoặc 50051-50056:
- Trên Windows PowerShell:
  ```powershell
  # Tìm PID đang giữ port (ví dụ 3000):
  netstat -ano | findstr :3000
  # Tắt tiến trình bằng PID:
  taskkill /F /PID <PID_NUMBER>
  ```

### 2. Lỗi thực thi Script trên PowerShell (Execution Policy)
Nếu gặp thông báo `cannot be loaded because running scripts is disabled on this system` khi chạy file `.ps1`:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### 3. Khôi phục dữ liệu phiên làm việc
Nếu muốn xóa sạch lịch sử chat cũ để bắt đầu một phiên hoàn toàn mới, bạn chỉ cần xóa file `var/gateway-sessions.json` hoặc nhấn nút xóa dữ liệu trên trình duyệt.
