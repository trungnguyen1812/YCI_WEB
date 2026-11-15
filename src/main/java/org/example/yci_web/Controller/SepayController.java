package org.example.yci_web.Controller;

import jakarta.servlet.http.HttpSession;
import org.example.yci_web.Model.DTO.CancellationRequestDTO;
import org.example.yci_web.Model.DTO.RefundDTO;
import org.example.yci_web.Model.DTO.UserDTO;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Service.SepayService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class SepayController {

    @Autowired
    private SepayService sepayService;

    // ─── Helpers ───────────────────────────────────────────────
    private UserDTO currentUser(HttpSession session) {
        Object u = session.getAttribute("currentUser");
        return u instanceof UserDTO ? (UserDTO) u : null;
    }

    private boolean isAdmin(HttpSession session) {
        UserDTO u = currentUser(session);
        return u != null && u.getRole() != null && u.getRole() == 0;
    }

    // ══════════════════════════════════════════════════════════
    //  QR DEPOSIT
    // ══════════════════════════════════════════════════════════

    /** Khách mở trang thanh toán QR cho đơn của mình */
    @GetMapping("/api/deposit/qr/{bookingId}")
    public ResponseEntity<Object> getDepositQR(@PathVariable Long bookingId,
                                               HttpSession session) {
        UserDTO user = currentUser(session);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        Map<String, Object> qr = sepayService.createDepositQR(bookingId);
        return ResponseEntity.ok(qr);
    }

    /** Polling: khách kiểm tra trạng thái đã thanh toán chưa */
    @GetMapping("/api/deposit/status/{bookingId}")
    public ResponseEntity<Object> getDepositStatus(@PathVariable Long bookingId,
                                                   HttpSession session) {
        UserDTO user = currentUser(session);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(sepayService.getDepositStatus(bookingId));
    }

    /**
     * Webhook endpoint — SePay POST vào đây khi có giao dịch chuyển khoản.
     * SePay gửi token qua header "Authorization: Bearer <token>" hoặc "token: <token>"
     * KHÔNG yêu cầu session (webhook đến từ server SePay).
     */
    @PostMapping("/api/sepay/webhook")
    public ResponseEntity<Object> webhook(
            @RequestBody String rawPayload,
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestHeader(value = "Apikey", required = false) String apikeyHeader,
            @RequestHeader(value = "token", required = false) String tokenHeader) {

        // SePay gửi: Authorization: Apikey <token>  HOẶC  Apikey: <token>
        String token = null;
        if (authHeader != null && authHeader.startsWith("Apikey ")) {
            token = authHeader.substring(7).trim();       // "Apikey TOKEN" → lấy TOKEN
        } else if (apikeyHeader != null) {
            token = apikeyHeader.trim();                  // header riêng "Apikey: TOKEN"
        } else if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7).trim();
        } else if (tokenHeader != null) {
            token = tokenHeader.trim();
        } else if (authHeader != null) {
            token = authHeader.trim();
        }

        MessageResponse response = sepayService.handleWebhook(rawPayload, token);
        return new ResponseEntity<>(response, response.getStatus());
    }

    // ══════════════════════════════════════════════════════════
    //  CANCELLATION REQUESTS (Khách)
    // ══════════════════════════════════════════════════════════

    /** Khách gửi yêu cầu hủy đơn + thông tin TK nhận hoàn */
    @PostMapping("/api/booking/{bookingId}/cancel-request")
    public ResponseEntity<Object> requestCancellation(
            @PathVariable Long bookingId,
            @RequestBody Map<String, String> body,
            HttpSession session) {

        UserDTO user = currentUser(session);
        if (user == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        String reason      = body.getOrDefault("reason", "");
        String bankName    = body.getOrDefault("bankName", "");
        String accountNo   = body.getOrDefault("accountNo", "");
        String accountName = body.getOrDefault("accountName", "");

        if (reason.isBlank()) {
            MessageResponse r = new MessageResponse();
            r.setMessage("Vui lòng nhập lý do hủy");
            r.setStatus(HttpStatus.BAD_REQUEST);
            return new ResponseEntity<>(r, HttpStatus.BAD_REQUEST);
        }

        MessageResponse response = sepayService.requestCancellation(
                bookingId, user.getIdUser(), reason, bankName, accountNo, accountName);
        return new ResponseEntity<>(response, response.getStatus());
    }

    // ══════════════════════════════════════════════════════════
    //  ADMIN: Cancellation Management
    // ══════════════════════════════════════════════════════════

    /** Admin lấy danh sách yêu cầu hủy đang chờ duyệt */
    @GetMapping("/api/admin/cancellations/pending")
    public ResponseEntity<Object> getPendingCancellations(HttpSession session) {
        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<CancellationRequestDTO> list = sepayService.getPendingCancellations();
        DataResponse r = new DataResponse(); r.setData(list); r.setStatus(HttpStatus.OK); r.setMessage("OK");
        return ResponseEntity.ok(r);
    }

    /** Admin lấy toàn bộ lịch sử yêu cầu hủy */
    @GetMapping("/api/admin/cancellations")
    public ResponseEntity<Object> getAllCancellations(HttpSession session) {
        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<CancellationRequestDTO> list = sepayService.getAllCancellations();
        DataResponse r = new DataResponse(); r.setData(list); r.setStatus(HttpStatus.OK); r.setMessage("OK");
        return ResponseEntity.ok(r);
    }

    /** Admin duyệt yêu cầu hủy */
    @PutMapping("/api/admin/cancellations/{id}/approve")
    public ResponseEntity<Object> approveCancellation(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            HttpSession session) {

        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        UserDTO admin = currentUser(session);
        Double refundAmount = body.get("refundAmount") != null
                ? Double.valueOf(body.get("refundAmount").toString()) : null;
        String adminNote = (String) body.get("adminNote");

        MessageResponse response = sepayService.approveCancellation(id, admin.getIdUser(), refundAmount, adminNote);
        return new ResponseEntity<>(response, response.getStatus());
    }

    /** Admin từ chối yêu cầu hủy */
    @PutMapping("/api/admin/cancellations/{id}/reject")
    public ResponseEntity<Object> rejectCancellation(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        UserDTO admin = currentUser(session);
        MessageResponse response = sepayService.rejectCancellation(id, admin.getIdUser(), body.get("adminNote"));
        return new ResponseEntity<>(response, response.getStatus());
    }

    // ══════════════════════════════════════════════════════════
    //  ADMIN: Refund Management
    // ══════════════════════════════════════════════════════════

    /** Admin lấy danh sách hoàn tiền đang chờ chuyển khoản */
    @GetMapping("/api/admin/refunds/pending")
    public ResponseEntity<Object> getPendingRefunds(HttpSession session) {
        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<RefundDTO> list = sepayService.getPendingRefunds();
        DataResponse r = new DataResponse(); r.setData(list); r.setStatus(HttpStatus.OK); r.setMessage("OK");
        return ResponseEntity.ok(r);
    }

    /** Admin lấy toàn bộ lịch sử hoàn tiền */
    @GetMapping("/api/admin/refunds")
    public ResponseEntity<Object> getAllRefunds(HttpSession session) {
        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        List<RefundDTO> list = sepayService.getAllRefunds();
        DataResponse r = new DataResponse(); r.setData(list); r.setStatus(HttpStatus.OK); r.setMessage("OK");
        return ResponseEntity.ok(r);
    }

    /**
     * Admin xác nhận đã chuyển khoản hoàn tiền thủ công.
     * Nút bấm phải ghi "Xác nhận đã chuyển khoản" — hệ thống KHÔNG tự chuyển tiền.
     */
    @PutMapping("/api/admin/refunds/{id}/confirm-transferred")
    public ResponseEntity<Object> confirmRefund(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            HttpSession session) {

        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        UserDTO admin = currentUser(session);

        Double actualAmount = body.get("actualAmount") != null
                ? Double.valueOf(body.get("actualAmount").toString()) : null;
        String transferRef  = (String) body.get("transferRef");
        String transferNote = (String) body.get("transferNote");
        String adminNote    = (String) body.get("adminNote");

        MessageResponse response = sepayService.confirmRefundTransferred(
                id, admin.getIdUser(), actualAmount, transferRef, transferNote, adminNote);
        return new ResponseEntity<>(response, response.getStatus());
    }

    /** Admin đánh dấu hoàn tiền thất bại */
    @PutMapping("/api/admin/refunds/{id}/mark-failed")
    public ResponseEntity<Object> markRefundFailed(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!isAdmin(session)) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        UserDTO admin = currentUser(session);
        MessageResponse response = sepayService.markRefundFailed(id, admin.getIdUser(), body.get("failureReason"));
        return new ResponseEntity<>(response, response.getStatus());
    }

    /** Lấy thông tin tài khoản ngân hàng cửa hàng (dùng cho build QR thanh toán) */
    @GetMapping("/api/bank-info")
    public ResponseEntity<Object> getBankInfo() {
        return ResponseEntity.ok(sepayService.getBankInfo());
    }
}
