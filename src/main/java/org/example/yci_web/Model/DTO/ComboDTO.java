package org.example.yci_web.Model.DTO;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class ComboDTO {
    private Long idCombo;
    private String nameCombo;
    private String description;
    private Double discountPrice;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** Danh sách sản phẩm trong combo (flatten từ ComboItemEntity). */
    private List<ComboProductDTO> products;

    /**
     * Trạng thái tổng hợp của combo:
     * - "RENTING"      — ít nhất 1 sản phẩm đang được thuê
     * - "PARTIAL"      — một số sản phẩm sẵn sàng, một số không
     * - "AVAILABLE"    — tất cả sản phẩm đều sẵn sàng
     * - "UNAVAILABLE"  — không có sản phẩm nào sẵn sàng
     */
    private String comboStatus;

    /** Tổng giá gốc (tính từ depositPrice của từng sản phẩm). */
    private Double totalBasePrice;

    /** Tổng giá theo ngày của tất cả sản phẩm (sum pricePerDay). */
    private Double totalPricePerDay;

    /** Ảnh combo (base64). */
    private List<ImageDTO> imageDTOS;
}
