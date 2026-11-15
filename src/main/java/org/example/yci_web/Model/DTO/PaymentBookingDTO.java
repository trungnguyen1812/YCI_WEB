package org.example.yci_web.Model.DTO;

import jakarta.persistence.Column;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class PaymentBookingDTO {
    private Long idPaymentBooking;
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime paidAt;
    private Double price;
    private Double remainAmount;
    private String paymentMethod;
    private String paymentStatus; // PENDING | PAID | EXPIRED | FAILED — để UI phân biệt đã cọc / chưa cọc
    private String note;          // Nhãn mô tả khoản thu: "Tiền cọc", "Phụ thu", "Thanh toán thuê"
}
