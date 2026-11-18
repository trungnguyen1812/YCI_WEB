package org.example.yci_web.Model.Request;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
public class ComboRequest {
    private Long idCombo;           // null = tạo mới, có giá trị = cập nhật
    private String nameCombo;
    private String description;
    private Double discountPrice;
    private List<Long> productIds;  // danh sách id sản phẩm trong combo
    private List<MultipartFile> images; // ảnh combo (upload)
}
