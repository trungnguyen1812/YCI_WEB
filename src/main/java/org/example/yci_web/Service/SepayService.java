package org.example.yci_web.Service;

import org.example.yci_web.Entity.BookingEntity;
import org.example.yci_web.Entity.CancellationRequestEntity;
import org.example.yci_web.Entity.PaymentBookingEntity;
import org.example.yci_web.Entity.RefundEntity;
import org.example.yci_web.Model.DTO.CancellationRequestDTO;
import org.example.yci_web.Model.DTO.RefundDTO;
import org.example.yci_web.Model.Response.MessageResponse;

import java.util.List;
import java.util.Map;

public interface SepayService {

    // ── QR Deposit ──────────────────────────────────────────────────
    /** Tạo payment record PENDING + trả về thông tin QR để hiển thị */
    Map<String, Object> createDepositQR(Long bookingId);

    /** Lấy trạng thái thanh toán hiện tại của đơn */
    Map<String, Object> getDepositStatus(Long bookingId);

    /** Xử lý webhook từ SePay (xác thực signature + ghi nhận thanh toán) */
    MessageResponse handleWebhook(String rawPayload, String signatureHeader);

    /** Lấy thông tin ngân hàng cửa hàng (bank code, số TK, tên TK) */
    Map<String, Object> getBankInfo();

    // ── Cancellation Requests ────────────────────────────────────────
    /** Khách gửi yêu cầu hủy đơn đã cọc */
    MessageResponse requestCancellation(Long bookingId, Long userId,
                                        String reason,
                                        String bankName, String accountNo, String accountName);

    /** Admin lấy danh sách yêu cầu hủy chờ duyệt */
    List<CancellationRequestDTO> getPendingCancellations();

    /** Admin lấy toàn bộ lịch sử yêu cầu hủy */
    List<CancellationRequestDTO> getAllCancellations();

    /** Admin duyệt yêu cầu hủy + tạo refund record */
    MessageResponse approveCancellation(Long cancellationId, Long adminId,
                                        Double refundAmount, String adminNote);

    /** Admin từ chối yêu cầu hủy */
    MessageResponse rejectCancellation(Long cancellationId, Long adminId, String adminNote);

    // ── Refund (thủ công) ────────────────────────────────────────────
    /** Admin lấy danh sách hoàn tiền chờ chuyển khoản */
    List<RefundDTO> getPendingRefunds();

    /** Admin lấy toàn bộ lịch sử hoàn tiền */
    List<RefundDTO> getAllRefunds();

    /**
     * Admin xác nhận đã chuyển khoản hoàn tiền thủ công.
     * Chỉ ghi nhận — KHÔNG thực hiện bất kỳ API hoàn tiền tự động nào.
     */
    MessageResponse confirmRefundTransferred(Long refundId, Long adminId,
                                             Double actualAmount,
                                             String transferRef, String transferNote,
                                             String adminNote);

    /** Admin đánh dấu hoàn tiền thất bại và lý do */
    MessageResponse markRefundFailed(Long refundId, Long adminId, String failureReason);
}
