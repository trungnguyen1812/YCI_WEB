package org.example.yci_web.Model.DTO;

import lombok.*;
import java.time.LocalDateTime;

@Getter @Setter @AllArgsConstructor @NoArgsConstructor @Builder
public class DepositQrDTO {
    private Long idBooking;
    private Long idPayment;
    private String referenceCode;      // nội dung chuyển khoản
    private String paymentStatus;      // PENDING | PAID | EXPIRED
    private Double amount;             // số tiền cọc
    private String bankCode;           // VietinBank
    private String accountNumber;      // số TK cửa hàng
    private String accountName;        // tên TK cửa hàng
    private String qrImageUrl;         // URL ảnh QR từ SePay
    private LocalDateTime expiresAt;   // hết hạn lúc nào
}
