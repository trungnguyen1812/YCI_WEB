package org.example.yci_web.Service.Implement;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.yci_web.Entity.*;
import org.example.yci_web.Model.DTO.*;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Repository.*;
import org.example.yci_web.Service.NotificationService;
import org.example.yci_web.Service.SepayService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class SepayServiceImpl implements SepayService {

    // ── Config (từ application.properties) ────────────────────
    @Value("${sepay.webhook-secret:CHANGE_ME}")
    private String webhookSecret;

    @Value("${sepay.bank-code:VietinBank}")
    private String bankCode;

    @Value("${sepay.account-number:YOUR_ACCOUNT}")
    private String accountNumber;

    @Value("${sepay.account-name:YCI CAMERA RENTAL}")
    private String accountName;

    @Value("${sepay.qr-expire-minutes:30}")
    private int qrExpireMinutes;

    @Value("${sepay.reference-prefix:YCI}")
    private String refPrefix;

    // ── Repositories ───────────────────────────────────────────
    @Autowired private BookingRepository bookingRepository;
    @Autowired private PaymentBookingRepository paymentBookingRepository;
    @Autowired private PaymentsMethodRepository paymentsMethodRepository;
    @Autowired private CancellationRequestRepository cancellationRepository;
    @Autowired private RefundRepository refundRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private StatusRepository statusRepository;
    @Autowired private NotificationService notificationService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ══════════════════════════════════════════════════════════
    //  1. QR Deposit
    // ══════════════════════════════════════════════════════════

    @Override
    @Transactional
    public Map<String, Object> createDepositQR(Long bookingId) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            BookingEntity booking = bookingRepository.findById(bookingId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy đơn"));

            String status = booking.getStatusEntity() == null ? ""
                    : booking.getStatusEntity().getStatusCode();
            boolean isWaiting  = status.equals("WAITING ACCEPT") || status.equals("WAITING_ACCEPT");
            boolean isPending   = status.equals("PENDING_DEPOSIT");

            if (!isWaiting && !isPending) {
                result.put("error", "Đơn không ở trạng thái chờ thanh toán");
                return result;
            }

            // Kiểm tra đã có payment PENDING chưa → tái sử dụng nếu còn hạn
            Optional<PaymentBookingEntity> existing = paymentBookingRepository
                    .findByBookingEntity(booking).stream()
                    .filter(p -> "PENDING".equals(p.getPaymentStatus()))
                    .filter(p -> p.getExpiresAt() != null && p.getExpiresAt().isAfter(LocalDateTime.now()))
                    .findFirst();

            PaymentBookingEntity payment;
            if (existing.isPresent()) {
                payment = existing.get();
            } else {
                // Tính tiền cọc = tổng depositPrice của tất cả sản phẩm trong đơn
                double depositAmount = booking.getBookingDetailEntities().stream()
                        .mapToDouble(detail -> {
                            if (detail.getProductEntity() != null
                                    && detail.getProductEntity().getDepositPrice() != null) {
                                return detail.getProductEntity().getDepositPrice();
                            }
                            return 0.0;
                        }).sum();

                // Fallback: nếu sản phẩm chưa set depositPrice → dùng 30% tổng đơn
                if (depositAmount <= 0) {
                    double depositPct = 30.0;
                    if (booking.getDepositTypeEntity() != null
                            && booking.getDepositTypeEntity().getPercentDeposit() != null) {
                        depositPct = booking.getDepositTypeEntity().getPercentDeposit();
                    }
                    depositAmount = (depositPct * booking.getTotalAmount()) / 100.0;
                }

                // Tạo mã tham chiếu duy nhất: YCI + bookingId + 4 số random
                String refCode = refPrefix + bookingId + String.format("%04d", new Random().nextInt(9999));

                // Tìm hoặc tạo payment method "SePay QR"
                PaymentsMethodEntity method = paymentsMethodRepository
                        .findAll().stream()
                        .filter(m -> m.getMethod() != null && m.getMethod().toLowerCase().contains("sepay"))
                        .findFirst()
                        .orElseGet(() -> {
                            PaymentsMethodEntity m = new PaymentsMethodEntity();
                            m.setMethod("SePay QR");
                            return paymentsMethodRepository.save(m);
                        });

                payment = new PaymentBookingEntity();
                payment.setBookingEntity(booking);
                payment.setPaymentsMethodEntity(method);
                payment.setPrice(depositAmount);
                payment.setRemainAmount(booking.getTotalAmount() - depositAmount);
                payment.setPaymentStatus("PENDING");
                payment.setReferenceCode(refCode);
                payment.setExpiresAt(LocalDateTime.now().plusMinutes(qrExpireMinutes));
                payment.setNote("Tiền cọc (chuyển khoản QR)");
                paymentBookingRepository.save(payment);

                // Cập nhật trạng thái đơn → PENDING_DEPOSIT
                if (isWaiting) {
                    StatusEntity pendingStatus = findOrCreateStatus("PENDING_DEPOSIT");
                    booking.setStatusEntity(pendingStatus);
                    bookingRepository.save(booking);
                }
            }

            String qrUrl = buildQrUrl(payment.getReferenceCode(), payment.getPrice().longValue());

            result.put("idBooking",      booking.getIdBooking());
            result.put("idPayment",      payment.getIdPaymentBooking());
            result.put("referenceCode",  payment.getReferenceCode());
            result.put("paymentStatus",  payment.getPaymentStatus());
            result.put("amount",         payment.getPrice());
            result.put("bankCode",       bankCode);
            result.put("accountNumber",  accountNumber);
            result.put("accountName",    accountName);
            result.put("qrImageUrl",     qrUrl);
            result.put("expiresAt",      payment.getExpiresAt());
            result.put("transferContent", "SEVQR " + payment.getReferenceCode());

        } catch (NoSuchElementException e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    @Override
    public Map<String, Object> getDepositStatus(Long bookingId) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            BookingEntity booking = bookingRepository.findById(bookingId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy đơn"));

            String bookingStatus = booking.getStatusEntity() == null ? ""
                    : booking.getStatusEntity().getStatusCode();

            List<PaymentBookingEntity> payments = paymentBookingRepository.findByBookingEntity(booking);
            Optional<PaymentBookingEntity> pending = payments.stream()
                    .filter(p -> "PENDING".equals(p.getPaymentStatus())).findFirst();
            Optional<PaymentBookingEntity> paid = payments.stream()
                    .filter(p -> "PAID".equals(p.getPaymentStatus())).findFirst();

            result.put("bookingStatus",  bookingStatus);
            result.put("depositPaid",    paid.isPresent());
            result.put("paidAmount",     paid.map(PaymentBookingEntity::getPrice).orElse(0.0));

            if (pending.isPresent()) {
                PaymentBookingEntity p = pending.get();
                boolean expired = p.getExpiresAt() != null && p.getExpiresAt().isBefore(LocalDateTime.now());
                result.put("pendingPaymentStatus", expired ? "EXPIRED" : "PENDING");
                result.put("expiresAt",  p.getExpiresAt());
                result.put("referenceCode", p.getReferenceCode());
                if (expired) {
                    p.setPaymentStatus("EXPIRED");
                    paymentBookingRepository.save(p);
                }
            }
        } catch (NoSuchElementException e) {
            result.put("error", e.getMessage());
        }
        return result;
    }

    @Override
    @Transactional
    public MessageResponse handleWebhook(String rawPayload, String signatureHeader) {
        MessageResponse response = new MessageResponse();
        try {
            // LOG để debug
            System.out.println("=== SEPAY WEBHOOK RECEIVED ===");
            System.out.println("Signature header: " + signatureHeader);
            System.out.println("Raw payload: " + rawPayload);

            // 1. Xác thực chữ ký
            if (!verifyWebhookSignature(rawPayload, signatureHeader)) {
                System.out.println("=== WEBHOOK AUTH FAILED === expected: " + webhookSecret + " | got: " + signatureHeader);
                response.setMessage("Chữ ký webhook không hợp lệ");
                response.setStatus(HttpStatus.UNAUTHORIZED);
                return response;
            }

            JsonNode root = objectMapper.readTree(rawPayload);

            String transferType    = root.path("transferType").asText("");
            double transferAmount  = root.path("transferAmount").asDouble(0);
            String content         = root.path("content").asText("");
            String transactionId   = root.path("id").asText("");

            System.out.println("transferType: " + transferType);
            System.out.println("transferAmount: " + transferAmount);
            System.out.println("content: " + content);
            System.out.println("transactionId: " + transactionId);

            // Chỉ xử lý tiền vào (in)
            if (!"in".equalsIgnoreCase(transferType)) {
                response.setMessage("Bỏ qua: không phải tiền vào");
                response.setStatus(HttpStatus.OK);
                return response;
            }

            // Tìm referenceCode trong nội dung chuyển khoản
            String foundRef = extractReferenceCode(content);
            if (foundRef == null) {
                response.setMessage("Không tìm thấy mã tham chiếu trong nội dung");
                response.setStatus(HttpStatus.OK);
                return response;
            }

            // Tìm payment record
            Optional<PaymentBookingEntity> paymentOpt = paymentBookingRepository.findByReferenceCode(foundRef);
            if (paymentOpt.isEmpty()) {
                response.setMessage("Không tìm thấy payment với mã: " + foundRef);
                response.setStatus(HttpStatus.OK);
                return response;
            }

            PaymentBookingEntity payment = paymentOpt.get();

            // Chống ghi nhận trùng
            if ("PAID".equals(payment.getPaymentStatus())) {
                response.setMessage("Đã xử lý trước đó — bỏ qua");
                response.setStatus(HttpStatus.OK);
                return response;
            }

            // Kiểm tra hết hạn — dùng thời gian GD thực tế, không phải thời gian nhận webhook
            String transactionDateStr = root.path("transactionDate").asText("");
            java.time.LocalDateTime transactionTime = null;
            try {
                transactionTime = java.time.LocalDateTime.parse(
                    transactionDateStr.replace(" ", "T"),
                    java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
                );
            } catch (Exception e) {
                transactionTime = LocalDateTime.now();
            }

            if (payment.getExpiresAt() != null && transactionTime.isAfter(payment.getExpiresAt())) {
                payment.setPaymentStatus("EXPIRED");
                paymentBookingRepository.save(payment);
                System.out.println("=== WEBHOOK: QR hết hạn. GD lúc " + transactionTime + " > hết hạn " + payment.getExpiresAt());
                response.setMessage("QR đã hết hạn — lưu để đối soát");
                response.setStatus(HttpStatus.OK);
                return response;
            }

            BookingEntity booking = payment.getBookingEntity();
            double expectedAmount = payment.getPrice();

            if (transferAmount < expectedAmount * 0.99) {
                // Tiền thiếu — lưu giao dịch nhưng KHÔNG xác nhận
                payment.setGatewayTxnId(transactionId);
                paymentBookingRepository.save(payment);
                notificationService.push(booking.getUserEntity().getIdUser(),
                        "Thanh toán chưa đủ số tiền ⚠️",
                        "Chúng tôi nhận được " + (long) transferAmount + " đ / cần " + (long) expectedAmount + " đ. Vui lòng liên hệ cửa hàng.",
                        "WARNING", "/orders");
                response.setMessage("Tiền thiếu — ghi nhận để đối soát");
                response.setStatus(HttpStatus.OK);
                return response;
            }

            // ✅ Thanh toán hợp lệ — xác nhận đơn
            payment.setPaymentStatus("PAID");
            payment.setPaidAt(LocalDateTime.now());
            payment.setGatewayTxnId(transactionId);
            paymentBookingRepository.save(payment);

            // Cập nhật đơn → ACCEPTED
            StatusEntity accepted = findOrCreateStatus("ACCEPTED");
            booking.setStatusEntity(accepted);
            bookingRepository.save(booking);

            // Thông báo khách
            notificationService.push(booking.getUserEntity().getIdUser(),
                    "Cọc xác nhận thành công ✅",
                    "Đơn thuê #" + booking.getIdBooking() + " đã được xác nhận. Vui lòng đến nhận thiết bị đúng giờ.",
                    "SUCCESS", "/orders");

            // Thông báo staff
            pushToStaff("Nhận cọc thành công #" + booking.getIdBooking(),
                    "Khách " + booking.getUserEntity().getFullName() + " đã thanh toán cọc " + (long) transferAmount + " đ qua SePay.",
                    "SUCCESS", "/admin/bookings");

            response.setMessage("Xác nhận đơn thành công");
            response.setStatus(HttpStatus.OK);

        } catch (Exception e) {
            response.setMessage("Lỗi xử lý webhook: " + e.getMessage());
            response.setStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return response;
    }

    // ══════════════════════════════════════════════════════════
    //  2. Cancellation Requests
    // ══════════════════════════════════════════════════════════

    @Override
    @Transactional
    public MessageResponse requestCancellation(Long bookingId, Long userId,
                                               String reason,
                                               String bankName, String accountNo, String accountName) {
        MessageResponse response = new MessageResponse();
        try {
            BookingEntity booking = bookingRepository.findById(bookingId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy đơn"));

            // Kiểm tra quyền sở hữu
            if (!booking.getUserEntity().getIdUser().equals(userId)) {
                response.setMessage("Bạn không có quyền yêu cầu hủy đơn này");
                response.setStatus(HttpStatus.FORBIDDEN);
                return response;
            }

            // Kiểm tra trạng thái đơn
            String status = booking.getStatusEntity() == null ? ""
                    : booking.getStatusEntity().getStatusCode().toUpperCase();
            boolean canRequest = status.contains("ACCEPTED") || status.contains("WAITING")
                    || status.contains("PENDING_DEPOSIT") || status.contains("RENTING");
            if (!canRequest) {
                response.setMessage("Không thể yêu cầu hủy đơn ở trạng thái hiện tại");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            // Chặn yêu cầu trùng
            if (cancellationRepository.findByBookingEntityAndStatus(booking, "PENDING").isPresent()) {
                response.setMessage("Bạn đã gửi yêu cầu hủy cho đơn này, đang chờ admin xử lý");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            UserEntity user = userRepository.findById(userId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy người dùng"));

            CancellationRequestEntity req = new CancellationRequestEntity();
            req.setBookingEntity(booking);
            req.setUserEntity(user);
            req.setReason(reason);
            req.setStatus("PENDING");
            req.setRefundBankName(bankName);
            req.setRefundAccountNo(accountNo);
            req.setRefundAccountName(accountName);
            req.setCreatedAt(LocalDateTime.now());
            cancellationRepository.save(req);

            // Đánh dấu trạng thái đơn
            booking.setStatusEntity(findOrCreateStatus("CANCEL_REQUESTED"));
            bookingRepository.save(booking);

            // Mã đơn hiển thị (dùng bookingCode nếu có, fallback về #id)
            String displayCode = (booking.getBookingCode() != null && !booking.getBookingCode().isBlank())
                    ? booking.getBookingCode() : ("#" + bookingId);

            // Thông báo cho khách: xác nhận đã gửi yêu cầu hủy
            notificationService.push(user.getIdUser(),
                    "Yêu cầu hủy đã được gửi ⏳",
                    "Yêu cầu hủy đơn " + displayCode + " đã được tiếp nhận. Admin sẽ xem xét và phản hồi sớm nhất.",
                    "WARNING", "/orders");

            // Thông báo admin & nhân viên
            pushToStaff("Yêu cầu hủy đơn " + displayCode,
                    "Khách " + user.getFullName() + " yêu cầu hủy đơn " + displayCode + ". Lý do: " + reason,
                    "WARNING", "/admin/bookings");

            response.setMessage("Đã gửi yêu cầu hủy. Admin sẽ xem xét và phản hồi sớm nhất.");
            response.setStatus(HttpStatus.OK);

        } catch (NoSuchElementException e) {
            response.setMessage(e.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    @Override
    public List<CancellationRequestDTO> getPendingCancellations() {
        return cancellationRepository.findByStatusOrderByCreatedAtDesc("PENDING")
                .stream().map(this::toCancellationDTO).toList();
    }

    @Override
    public List<CancellationRequestDTO> getAllCancellations() {
        return cancellationRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toCancellationDTO).toList();
    }

    @Override
    @Transactional
    public MessageResponse approveCancellation(Long cancellationId, Long adminId,
                                               Double refundAmount, String adminNote) {
        MessageResponse response = new MessageResponse();
        try {
            CancellationRequestEntity req = cancellationRepository.findById(cancellationId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy yêu cầu hủy"));

            if (!"PENDING".equals(req.getStatus())) {
                response.setMessage("Yêu cầu hủy đã được xử lý rồi");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            // Kiểm tra số tiền hoàn không vượt quá đã thu
            double totalPaid = paymentBookingRepository
                    .findByBookingEntity(req.getBookingEntity()).stream()
                    .filter(p -> "PAID".equals(p.getPaymentStatus()))
                    .mapToDouble(p -> p.getPrice() == null ? 0 : p.getPrice()).sum();

            if (refundAmount != null && refundAmount > totalPaid) {
                response.setMessage("Số tiền hoàn (" + refundAmount + ") vượt quá số đã thu (" + totalPaid + ")");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            // Duyệt cancellation
            req.setStatus("APPROVED");
            req.setAdminNote(adminNote);
            req.setIdAdmin(adminId);
            req.setProcessedAt(LocalDateTime.now());
            cancellationRepository.save(req);

            // Hủy đơn + giải phóng lịch (trong cùng transaction)
            BookingEntity booking = req.getBookingEntity();
            booking.setStatusEntity(findOrCreateStatus("CANCELLED"));
            bookingRepository.save(booking);

            // Tạo refund record
            RefundEntity refund = new RefundEntity();
            refund.setCancellationRequest(req);
            refund.setBookingEntity(booking);
            refund.setApprovedAmount(refundAmount == null ? 0.0 : refundAmount);
            refund.setStatus(refundAmount != null && refundAmount > 0 ? "PENDING_TRANSFER" : "TRANSFERRED");
            // Sao chép thông tin TK nhận hoàn từ yêu cầu (không cho sửa sau duyệt)
            refund.setRefundBankName(req.getRefundBankName());
            refund.setRefundAccountNo(req.getRefundAccountNo());
            refund.setRefundAccountName(req.getRefundAccountName());
            if (refundAmount == null || refundAmount <= 0) {
                refund.setAdminNote("Không hoàn tiền. " + (adminNote == null ? "" : adminNote));
                refund.setActualAmount(0.0);
                refund.setTransferredAt(LocalDateTime.now());
                refund.setIdAdmin(adminId);
            }
            refund.setCreatedAt(LocalDateTime.now());
            refundRepository.save(refund);

            // Thông báo khách
            String refundMsg = (refundAmount != null && refundAmount > 0)
                    ? "Bạn sẽ được hoàn " + (long) (double) refundAmount + " đ. Vui lòng chờ chuyển khoản."
                    : "Không có khoản hoàn tiền. " + (adminNote != null ? adminNote : "");
            notificationService.push(req.getUserEntity().getIdUser(),
                    "Yêu cầu hủy đơn đã được duyệt",
                    "Đơn thuê #" + booking.getIdBooking() + " đã được hủy. " + refundMsg,
                    refundAmount != null && refundAmount > 0 ? "INFO" : "WARNING",
                    "/orders");

            response.setMessage("Đã duyệt hủy và tạo bản ghi hoàn tiền");
            response.setStatus(HttpStatus.OK);

        } catch (NoSuchElementException e) {
            response.setMessage(e.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    @Override
    @Transactional
    public MessageResponse rejectCancellation(Long cancellationId, Long adminId, String adminNote) {
        MessageResponse response = new MessageResponse();
        try {
            CancellationRequestEntity req = cancellationRepository.findById(cancellationId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy yêu cầu hủy"));

            if (!"PENDING".equals(req.getStatus())) {
                response.setMessage("Yêu cầu hủy đã được xử lý rồi");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            req.setStatus("REJECTED");
            req.setAdminNote(adminNote);
            req.setIdAdmin(adminId);
            req.setProcessedAt(LocalDateTime.now());
            cancellationRepository.save(req);

            // Khôi phục trạng thái đơn về ACCEPTED
            BookingEntity booking = req.getBookingEntity();
            booking.setStatusEntity(findOrCreateStatus("ACCEPTED"));
            bookingRepository.save(booking);

            notificationService.push(req.getUserEntity().getIdUser(),
                    "Yêu cầu hủy đơn bị từ chối",
                    "Admin từ chối hủy đơn #" + booking.getIdBooking() + (adminNote != null ? ". Lý do: " + adminNote : ""),
                    "ERROR", "/orders");

            response.setMessage("Đã từ chối yêu cầu hủy");
            response.setStatus(HttpStatus.OK);

        } catch (NoSuchElementException e) {
            response.setMessage(e.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    // ══════════════════════════════════════════════════════════
    //  3. Manual Refund
    // ══════════════════════════════════════════════════════════

    @Override
    public List<RefundDTO> getPendingRefunds() {
        return refundRepository.findByStatusOrderByCreatedAtDesc("PENDING_TRANSFER")
                .stream().map(this::toRefundDTO).toList();
    }

    @Override
    public List<RefundDTO> getAllRefunds() {
        return refundRepository.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toRefundDTO).toList();
    }

    @Override
    @Transactional
    public MessageResponse confirmRefundTransferred(Long refundId, Long adminId,
                                                    Double actualAmount,
                                                    String transferRef, String transferNote,
                                                    String adminNote) {
        MessageResponse response = new MessageResponse();
        try {
            RefundEntity refund = refundRepository.findById(refundId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy bản ghi hoàn tiền"));

            if (!"PENDING_TRANSFER".equals(refund.getStatus())) {
                response.setMessage("Bản ghi hoàn tiền đã được xử lý rồi");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            // Kiểm tra số tiền thực không vượt quá approved
            if (actualAmount != null && actualAmount > refund.getApprovedAmount() * 1.01) {
                response.setMessage("Số tiền thực hoàn vượt quá số đã duyệt");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            refund.setStatus("TRANSFERRED");
            refund.setActualAmount(actualAmount != null ? actualAmount : refund.getApprovedAmount());
            refund.setTransferRef(transferRef);
            refund.setTransferNote(transferNote);
            refund.setAdminNote(adminNote);
            refund.setTransferredAt(LocalDateTime.now());
            refund.setIdAdmin(adminId);
            refundRepository.save(refund);

            // Cập nhật booking status → REFUNDED
            BookingEntity booking = refund.getBookingEntity();
            booking.setStatusEntity(findOrCreateStatus("REFUNDED"));
            bookingRepository.save(booking);

            notificationService.push(booking.getUserEntity().getIdUser(),
                    "Hoàn tiền thành công 💸",
                    "Chúng tôi đã chuyển khoản hoàn " + refund.getActualAmount().longValue() + " đ cho bạn. Mã GD: " + (transferRef != null ? transferRef : "N/A"),
                    "SUCCESS", "/orders");

            response.setMessage("Đã xác nhận hoàn tiền thành công");
            response.setStatus(HttpStatus.OK);

        } catch (NoSuchElementException e) {
            response.setMessage(e.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    @Override
    @Transactional
    public MessageResponse markRefundFailed(Long refundId, Long adminId, String failureReason) {
        MessageResponse response = new MessageResponse();
        try {
            RefundEntity refund = refundRepository.findById(refundId)
                    .orElseThrow(() -> new NoSuchElementException("Không tìm thấy bản ghi hoàn tiền"));

            if (!"PENDING_TRANSFER".equals(refund.getStatus())) {
                response.setMessage("Bản ghi không ở trạng thái chờ chuyển khoản");
                response.setStatus(HttpStatus.BAD_REQUEST);
                return response;
            }

            refund.setStatus("FAILED");
            refund.setFailureReason(failureReason);
            refund.setIdAdmin(adminId);
            refundRepository.save(refund);

            notificationService.push(refund.getBookingEntity().getUserEntity().getIdUser(),
                    "Hoàn tiền gặp sự cố ⚠️",
                    "Chuyển khoản hoàn tiền đơn #" + refund.getBookingEntity().getIdBooking() + " gặp sự cố. Cửa hàng sẽ liên hệ lại. Lý do: " + failureReason,
                    "ERROR", "/orders");

            response.setMessage("Đã đánh dấu hoàn tiền thất bại");
            response.setStatus(HttpStatus.OK);

        } catch (NoSuchElementException e) {
            response.setMessage(e.getMessage());
            response.setStatus(HttpStatus.NOT_FOUND);
        }
        return response;
    }

    // ══════════════════════════════════════════════════════════
    //  Private Helpers
    // ══════════════════════════════════════════════════════════

    @Override
    public Map<String, Object> getBankInfo() {
        Map<String, Object> info = new java.util.LinkedHashMap<>();
        info.put("bankCode",      bankCode);
        info.put("accountNumber", accountNumber);
        info.put("accountName",   accountName);
        return info;
    }

    /** Tạo URL ảnh QR dùng SePay Quick QR (không cần API token) */
    private String buildQrUrl(String referenceCode, long amount) {
        // VietinBank yêu cầu nội dung bắt đầu bằng SEVQR để SePay nhận biến động số dư
        try {
            String content = "SEVQR " + referenceCode;
            String encoded = URLEncoder.encode(content, StandardCharsets.UTF_8);
            return "https://qr.sepay.vn/img?acc=" + accountNumber
                    + "&bank=" + bankCode
                    + "&amount=" + amount
                    + "&des=" + encoded
                    + "&template=compact";
        } catch (Exception e) {
            return "";
        }
    }

    /** Xác thực chữ ký SePay webhook.
     *  SePay gửi header "Apikey" với giá trị = webhook secret bạn đặt trong dashboard */
    private boolean verifyWebhookSignature(String rawPayload, String signatureHeader) {
        if (signatureHeader == null || signatureHeader.isBlank()) return false;
        return webhookSecret.equals(signatureHeader.trim());
    }

    /** Trích mã tham chiếu từ nội dung chuyển khoản */
    private String extractReferenceCode(String content) {
        if (content == null) return null;
        // Tìm pattern: prefix + bookingId + 4 số  (vd YCI12341234)
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("(?i)(" + refPrefix + "\\d+)")
                .matcher(content);
        if (m.find()) return m.group(1).toUpperCase();
        return null;
    }

    private StatusEntity findOrCreateStatus(String code) {
        StatusEntity s = statusRepository.findByStatusCode(code);
        if (s != null) return s;
        s = new StatusEntity(); s.setStatusCode(code);
        return statusRepository.save(s);
    }

    private void pushToStaff(String title, String msg, String type, String link) {
        userRepository.findByRole(0).forEach(u ->
                notificationService.push(u.getIdUser(), title, msg, type, link));
        userRepository.findByRole(2).forEach(u ->
                notificationService.push(u.getIdUser(), title, msg, type, link));
    }

    private String maskAccountNo(String no) {
        if (no == null || no.length() < 4) return "****";
        return "*".repeat(no.length() - 4) + no.substring(no.length() - 4);
    }

    private CancellationRequestDTO toCancellationDTO(CancellationRequestEntity e) {
        CancellationRequestDTO dto = new CancellationRequestDTO();
        dto.setIdCancellation(e.getIdCancellation());
        dto.setIdBooking(e.getBookingEntity().getIdBooking());
        dto.setCustomerName(e.getUserEntity().getFullName());
        dto.setCustomerPhone(e.getUserEntity().getPhone());
        dto.setReason(e.getReason());
        dto.setStatus(e.getStatus());
        dto.setAdminNote(e.getAdminNote());
        dto.setIdAdmin(e.getIdAdmin());
        dto.setProcessedAt(e.getProcessedAt());
        dto.setCreatedAt(e.getCreatedAt());
        dto.setRefundBankName(e.getRefundBankName());
        dto.setRefundAccountNoMasked(maskAccountNo(e.getRefundAccountNo()));
        dto.setRefundAccountName(e.getRefundAccountName());
        dto.setTotalAmount(e.getBookingEntity().getTotalAmount());
        double paid = paymentBookingRepository.findByBookingEntity(e.getBookingEntity())
                .stream().filter(p -> "PAID".equals(p.getPaymentStatus()))
                .mapToDouble(p -> p.getPrice() == null ? 0 : p.getPrice()).sum();
        dto.setDepositPaid(paid);
        return dto;
    }

    private RefundDTO toRefundDTO(RefundEntity e) {
        RefundDTO dto = new RefundDTO();
        dto.setIdRefund(e.getIdRefund());
        dto.setIdCancellation(e.getCancellationRequest() != null ? e.getCancellationRequest().getIdCancellation() : null);
        dto.setIdBooking(e.getBookingEntity().getIdBooking());
        dto.setCustomerName(e.getBookingEntity().getUserEntity().getFullName());
        dto.setApprovedAmount(e.getApprovedAmount());
        dto.setActualAmount(e.getActualAmount());
        dto.setStatus(e.getStatus());
        dto.setRefundBankName(e.getRefundBankName());
        dto.setRefundAccountNoMasked(maskAccountNo(e.getRefundAccountNo()));
        dto.setRefundAccountName(e.getRefundAccountName());
        dto.setTransferRef(e.getTransferRef());
        dto.setTransferNote(e.getTransferNote());
        dto.setTransferredAt(e.getTransferredAt());
        dto.setIdAdmin(e.getIdAdmin());
        dto.setAdminNote(e.getAdminNote());
        dto.setFailureReason(e.getFailureReason());
        dto.setCreatedAt(e.getCreatedAt());
        return dto;
    }

    private Long getIdFromCancellation(Long cancellationId) {
        return cancellationId;
    }
}
