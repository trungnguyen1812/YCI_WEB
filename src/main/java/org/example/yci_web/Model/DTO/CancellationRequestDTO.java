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
    // Thông tin nhận hoàn (số TK đầy đủ)
    private String refundBankName;
    private String refundAccountNoMasked;  // giữ field name để tương thích, nhưng giờ trả số đầy đủ
    private String refundAccountName;
    // Thông tin đơn
    private Double totalAmount;
    private Double depositPaid;       // tổng đã cọc
}
