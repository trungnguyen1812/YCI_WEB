package org.example.yci_web.Model.DTO;

import lombok.*;
import java.time.LocalDateTime;

@Getter @Setter @AllArgsConstructor @NoArgsConstructor
public class RefundDTO {
    private Long idRefund;
    private Long idCancellation;
    private Long idBooking;
    private String customerName;
    private Double approvedAmount;
    private Double actualAmount;
    private String status;              // PENDING_TRANSFER | TRANSFERRED | FAILED
    private String refundBankName;
    private String refundAccountNoMasked;
    private String refundAccountName;
    private String transferRef;
    private String transferNote;
    private LocalDateTime transferredAt;
    private Long idAdmin;
    private String adminNote;
    private String failureReason;
    private LocalDateTime createdAt;
}
