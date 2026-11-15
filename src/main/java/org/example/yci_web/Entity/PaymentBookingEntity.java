package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "payment_booking")
public class PaymentBookingEntity {
    @Id
    @GeneratedValue(strategy =  GenerationType.IDENTITY)
    private Long idPaymentBooking;

    @Column(name = "paid_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime paidAt;

    @Column(name = "price")
    private Double price;

    @Column(name = "remain_amount")
    private Double remainAmount;

    // SePay tracking fields
    @Column(name = "reference_code", unique = true, length = 100)
    private String referenceCode;

    @Column(name = "payment_status", length = 30, nullable = false)
    private String paymentStatus = "PENDING"; // PENDING | PAID | EXPIRED | FAILED

    @Column(name = "note", length = 200)
    private String note; // Nhãn mô tả: "Tiền cọc", "Phụ thu trả trễ / vệ sinh / hỏng hóc", "Thanh toán"

    @Column(name = "gateway_txn_id", length = 200)
    private String gatewayTxnId;

    @Column(name = "expires_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime expiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_booking")
    private BookingEntity bookingEntity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_payment_method")
    private PaymentsMethodEntity paymentsMethodEntity;
}
