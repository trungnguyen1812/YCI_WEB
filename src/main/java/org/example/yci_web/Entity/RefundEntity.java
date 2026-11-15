package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "refunds")
public class RefundEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idRefund;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_cancellation", nullable = false)
    private CancellationRequestEntity cancellationRequest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_booking", nullable = false)
    private BookingEntity bookingEntity;

    @Column(name = "approved_amount", nullable = false)
    private Double approvedAmount;

    @Column(name = "actual_amount")
    private Double actualAmount;

    /** PENDING_TRANSFER | TRANSFERRED | FAILED */
    @Column(name = "status", nullable = false, length = 30)
    private String status = "PENDING_TRANSFER";

    // Thông tin tài khoản nhận (sao chép từ cancellation request khi duyệt)
    @Column(name = "refund_bank_name", length = 100)
    private String refundBankName;

    @Column(name = "refund_account_no", length = 50)
    private String refundAccountNo;

    @Column(name = "refund_account_name", length = 200)
    private String refundAccountName;

    // Admin xác nhận đã chuyển khoản
    @Column(name = "transfer_ref", length = 200)
    private String transferRef;

    @Column(name = "transfer_note", columnDefinition = "TEXT")
    private String transferNote;

    @Column(name = "transferred_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime transferredAt;

    @Column(name = "id_admin")
    private Long idAdmin;

    @Column(name = "admin_note", columnDefinition = "TEXT")
    private String adminNote;

    @Column(name = "failure_reason", columnDefinition = "TEXT")
    private String failureReason;

    @Column(name = "created_at", nullable = false)
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime createdAt;
}
