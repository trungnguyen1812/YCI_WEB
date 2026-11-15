package org.example.yci_web.Model.DTO;

import lombok.*;
import java.time.LocalDateTime;

@Getter @Setter @AllArgsConstructor @NoArgsConstructor
public class CancellationRequestDTO {
    private Long idCancellation;
    private Long idBooking;
    private String customerName;
    private String customerPhone;
    private String reason;
    private String status;           // PENDING | APPROVED | REJECTED
    private String adminNote;
    private Long idAdmin;
    private LocalDateTime processedAt;
    private LocalDateTime createdAt;
    // Thông tin nhận hoàn (che bớt số TK)
    private String refundBankName;
    private String refundAccountNoMasked;  // e.g. "****1234"
    private String refundAccountName;
    // Thông tin đơn
    private Double totalAmount;
    private Double depositPaid;       // tổng đã cọc
}
