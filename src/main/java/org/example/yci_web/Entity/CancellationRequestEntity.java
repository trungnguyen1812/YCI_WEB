package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "cancellation_requests")
public class CancellationRequestEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idCancellation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_booking", nullable = false)
    private BookingEntity bookingEntity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_user", nullable = false)
    private UserEntity userEntity;

    @Column(name = "reason", nullable = false, columnDefinition = "TEXT")
    private String reason;

    /** PENDING | APPROVED | REJECTED */
    @Column(name = "status", nullable = false, length = 30)
    private String status = "PENDING";

    @Column(name = "admin_note", columnDefinition = "TEXT")
    private String adminNote;

    @Column(name = "id_admin")
    private Long idAdmin;

    @Column(name = "processed_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime processedAt;

    @Column(name = "created_at", nullable = false)
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime createdAt;

    // Thông tin tài khoản nhận hoàn tiền (khách cung cấp)
    @Column(name = "refund_bank_name", length = 100)
    private String refundBankName;

    @Column(name = "refund_account_no", length = 50)
    private String refundAccountNo;

    @Column(name = "refund_account_name", length = 200)
    private String refundAccountName;
}
