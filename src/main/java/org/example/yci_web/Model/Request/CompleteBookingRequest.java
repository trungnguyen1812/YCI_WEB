package org.example.yci_web.Model.Request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CompleteBookingRequest {
    private Long bookingId;
    private Integer lateHours;      // Số giờ trễ (0 nếu không trễ)
    private Double lateFeePerHour;  // Phí mỗi giờ trễ (do frontend tính từ giá thuê / giờ)
    private Double cleaningFee;     // Phí vệ sinh (nhân viên nhập, mặc định 0)
    private Double damageFee;       // Phí hư hỏng (nhân viên nhập, mặc định 0)
    private String description;     // Ghi chú tình trạng thiết bị khi trả
    private String paymentMethod;   // "cash" | "transfer" — phương thức thu tiền còn lại
}
