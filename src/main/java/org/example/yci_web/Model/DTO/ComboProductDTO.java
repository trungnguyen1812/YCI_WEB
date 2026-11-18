package org.example.yci_web.Model.DTO;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class ComboProductDTO {
    private Long idProduct;
    private String nameProduct;
    private String brand;
    private String categoryName;
    private Double depositPrice;
    private String status;
    /** Giá thuê theo ngày của sản phẩm này (nếu có). */
    private Double pricePerDay;
    /** Ảnh đại diện đầu tiên (base64). */
    private String thumbnailBase64;
}
