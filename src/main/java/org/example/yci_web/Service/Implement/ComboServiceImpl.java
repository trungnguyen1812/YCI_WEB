package org.example.yci_web.Service.Implement;

import org.example.yci_web.Entity.*;
import org.example.yci_web.Model.DTO.ComboDTO;
import org.example.yci_web.Model.DTO.ComboProductDTO;
import org.example.yci_web.Model.DTO.ImageDTO;
import org.example.yci_web.Model.Request.ComboRequest;
import org.example.yci_web.Model.Response.DataResponse;
import org.example.yci_web.Model.Response.MessageResponse;
import org.example.yci_web.Repository.ComboImageRepository;
import org.example.yci_web.Repository.ComboRepository;
import org.example.yci_web.Repository.ProductRepository;
import org.example.yci_web.Service.ComboService;
import org.example.yci_web.Utils.ConvertByteToBase64;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Service
public class ComboServiceImpl implements ComboService {

    @Autowired
    private ComboRepository comboRepository;

    @Autowired
    private ComboImageRepository comboImageRepository;

    @Autowired
    private ProductRepository productRepository;

    // ── Helper: map ComboEntity → ComboDTO ───────────────────────────────
    private ComboDTO toComboDTO(ComboEntity c) {
        ComboDTO dto = new ComboDTO();
        dto.setIdCombo(c.getIdCombo());
        dto.setNameCombo(c.getNameCombo());
        dto.setDescription(c.getDescription());
        dto.setDiscountPrice(c.getDiscountPrice());
        dto.setActive(c.getActive() == null ? true : c.getActive());
        dto.setCreatedAt(c.getCreatedAt());
        dto.setUpdatedAt(c.getUpdatedAt());

        // Sản phẩm trong combo
        List<ComboProductDTO> products = c.getComboItemEntities().stream()
                .map(item -> toComboProductDTO(item.getProductEntity()))
                .collect(Collectors.toList());
        dto.setProducts(products);

        // Tổng giá gốc
        // Tổng giá gốc (deposit)
        double total = products.stream()
                .mapToDouble(p -> p.getDepositPrice() == null ? 0 : p.getDepositPrice())
                .sum();
        dto.setTotalBasePrice(total);

        // Tổng giá theo ngày
        double totalPerDay = products.stream()
                .mapToDouble(p -> p.getPricePerDay() == null ? 0 : p.getPricePerDay())
                .sum();
        dto.setTotalPricePerDay(totalPerDay);

        // Trạng thái tổng hợp combo
        long rentingCount   = products.stream().filter(p -> "RENTING".equalsIgnoreCase(p.getStatus())).count();
        long availableCount = products.stream().filter(p -> "AVAILABLE".equalsIgnoreCase(p.getStatus())).count();
        String comboStatus;
        if (rentingCount > 0) {
            comboStatus = "RENTING";
        } else if (availableCount == products.size()) {
            comboStatus = "AVAILABLE";
        } else if (availableCount > 0) {
            comboStatus = "PARTIAL";
        } else {
            comboStatus = "UNAVAILABLE";
        }
        dto.setComboStatus(comboStatus);

        // Ảnh combo
        List<ImageDTO> imageDTOs = c.getComboImageEntities().stream()
                .map(img -> {
                    ImageDTO imageDTO = new ImageDTO();
                    imageDTO.setIdImage(img.getIdComboImage());
                    imageDTO.setImageBase64(ConvertByteToBase64.toBase64(img.getImage()));
                    return imageDTO;
                })
                .collect(Collectors.toList());
        dto.setImageDTOS(imageDTOs);

        return dto;
    }

    // ── Helper: map ProductEntity → ComboProductDTO ──────────────────────
    private ComboProductDTO toComboProductDTO(ProductEntity p) {
        ComboProductDTO dto = new ComboProductDTO();
        dto.setIdProduct(p.getIdProduct());
        dto.setNameProduct(p.getNameProduct());
        dto.setBrand(p.getBrand());
        dto.setCategoryName(p.getCategoryEntity() != null ? p.getCategoryEntity().getNameCategory() : "");
        dto.setDepositPrice(p.getDepositPrice());
        dto.setStatus(p.getStatusEntity() != null ? p.getStatusEntity().getStatusCode() : "");

        // Giá theo ngày (loại rental type chứa "ngày" hoặc "day")
        p.getRentailPriceEntities().stream()
                .filter(rp -> rp.getRentalTypeEntity() != null &&
                        (rp.getRentalTypeEntity().getType().toLowerCase().contains("ngày")
                        || rp.getRentalTypeEntity().getType().toLowerCase().contains("day")))
                .findFirst()
                .ifPresent(rp -> dto.setPricePerDay(rp.getPrice()));

        // Thumbnail: ảnh đầu tiên
        if (!p.getImageEntities().isEmpty()) {
            dto.setThumbnailBase64(ConvertByteToBase64.toBase64(p.getImageEntities().get(0).getImage()));
        }
        return dto;
    }

    // ── Validate ảnh ─────────────────────────────────────────────────────
    private boolean hasImages(List<MultipartFile> images) {
        return images != null && images.stream().anyMatch(f -> f != null && !f.isEmpty());
    }

    // ── getAllCombos ──────────────────────────────────────────────────────
    @Override
    public DataResponse getAllCombos() {
        DataResponse<List<ComboDTO>> dataResponse = new DataResponse<>();
        List<ComboDTO> dtos = comboRepository.findAll().stream()
                .map(this::toComboDTO)
                .collect(Collectors.toList());
        dataResponse.setData(dtos);
        dataResponse.setMessage("Success");
        dataResponse.setStatus(HttpStatus.OK);
        return dataResponse;
    }

    // ── getComboById ──────────────────────────────────────────────────────
    @Override
    public Object getComboById(Long idCombo) {
        MessageResponse messageResponse = new MessageResponse();
        DataResponse<ComboDTO> dataResponse = new DataResponse<>();
        try {
            ComboEntity comboEntity = comboRepository.findById(idCombo).get();
            dataResponse.setData(toComboDTO(comboEntity));
            dataResponse.setMessage("Success");
            dataResponse.setStatus(HttpStatus.OK);
            return dataResponse;
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy combo");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            return messageResponse;
        }
    }

    // ── addCombo ──────────────────────────────────────────────────────────
    @Override
    public MessageResponse addCombo(ComboRequest req) {
        MessageResponse messageResponse = new MessageResponse();

        if (req.getNameCombo() == null || req.getNameCombo().isBlank()) {
            messageResponse.setMessage("Vui lòng nhập tên combo");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }

        if (req.getProductIds() == null || req.getProductIds().isEmpty()) {
            messageResponse.setMessage("Combo cần có ít nhất một sản phẩm");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }

        // Lookup tất cả sản phẩm
        List<ProductEntity> products = new ArrayList<>();
        for (Long pid : req.getProductIds()) {
            try {
                products.add(productRepository.findById(pid).get());
            } catch (NoSuchElementException ex) {
                messageResponse.setMessage("Không tìm thấy sản phẩm ID: " + pid);
                messageResponse.setStatus(HttpStatus.NOT_FOUND);
                return messageResponse;
            }
        }

        ComboEntity comboEntity = new ComboEntity();
        comboEntity.setNameCombo(req.getNameCombo());
        comboEntity.setDescription(req.getDescription());
        comboEntity.setDiscountPrice(req.getDiscountPrice());
        comboEntity.setActive(true);
        comboEntity.setCreatedAt(LocalDateTime.now());
        comboEntity.setUpdatedAt(LocalDateTime.now());

        // Combo items
        List<ComboItemEntity> items = new ArrayList<>();
        for (ProductEntity p : products) {
            ComboItemEntity item = new ComboItemEntity();
            item.setComboEntity(comboEntity);
            item.setProductEntity(p);
            items.add(item);
        }
        comboEntity.setComboItemEntities(items);

        // Ảnh combo
        if (hasImages(req.getImages())) {
            List<ComboImageEntity> imageEntities = new ArrayList<>();
            for (MultipartFile file : req.getImages()) {
                if (file == null || file.isEmpty()) continue;
                ComboImageEntity img = new ComboImageEntity();
                img.setComboEntity(comboEntity);
                try {
                    img.setImage(file.getBytes());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
                imageEntities.add(img);
            }
            comboEntity.setComboImageEntities(imageEntities);
        }

        comboRepository.save(comboEntity);
        messageResponse.setMessage("Tạo combo thành công");
        messageResponse.setStatus(HttpStatus.OK);
        return messageResponse;
    }

    // ── updateCombo ───────────────────────────────────────────────────────
    @Override
    public MessageResponse updateCombo(ComboRequest req) {
        MessageResponse messageResponse = new MessageResponse();

        if (req.getIdCombo() == null) {
            messageResponse.setMessage("Thiếu ID combo");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }

        if (req.getProductIds() == null || req.getProductIds().isEmpty()) {
            messageResponse.setMessage("Combo cần có ít nhất một sản phẩm");
            messageResponse.setStatus(HttpStatus.BAD_REQUEST);
            return messageResponse;
        }

        ComboEntity comboEntity;
        try {
            comboEntity = comboRepository.findById(req.getIdCombo()).get();
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy combo");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
            return messageResponse;
        }

        // Lookup sản phẩm
        List<ProductEntity> products = new ArrayList<>();
        for (Long pid : req.getProductIds()) {
            try {
                products.add(productRepository.findById(pid).get());
            } catch (NoSuchElementException ex) {
                messageResponse.setMessage("Không tìm thấy sản phẩm ID: " + pid);
                messageResponse.setStatus(HttpStatus.NOT_FOUND);
                return messageResponse;
            }
        }

        comboEntity.setNameCombo(req.getNameCombo());
        comboEntity.setDescription(req.getDescription());
        comboEntity.setDiscountPrice(req.getDiscountPrice());
        comboEntity.setUpdatedAt(LocalDateTime.now());

        // Cập nhật items (clear + re-add, orphanRemoval tự xóa cũ)
        comboEntity.getComboItemEntities().clear();
        for (ProductEntity p : products) {
            ComboItemEntity item = new ComboItemEntity();
            item.setComboEntity(comboEntity);
            item.setProductEntity(p);
            comboEntity.getComboItemEntities().add(item);
        }

        // Thêm ảnh mới (nếu có) — không xóa ảnh cũ, xóa riêng qua deleteComboImage
        if (hasImages(req.getImages())) {
            for (MultipartFile file : req.getImages()) {
                if (file == null || file.isEmpty()) continue;
                ComboImageEntity img = new ComboImageEntity();
                img.setComboEntity(comboEntity);
                try {
                    img.setImage(file.getBytes());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
                comboEntity.getComboImageEntities().add(img);
            }
        }

        comboRepository.save(comboEntity);
        messageResponse.setMessage("Cập nhật combo thành công");
        messageResponse.setStatus(HttpStatus.OK);
        return messageResponse;
    }

    // ── deleteCombo ───────────────────────────────────────────────────────
    @Override
    public MessageResponse deleteCombo(Long idCombo) {
        MessageResponse messageResponse = new MessageResponse();
        try {
            ComboEntity comboEntity = comboRepository.findById(idCombo).get();
            comboRepository.delete(comboEntity);
            messageResponse.setMessage("Xóa combo thành công");
            messageResponse.setStatus(HttpStatus.OK);
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy combo");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
        }
        return messageResponse;
    }

    // ── toggleComboActive ─────────────────────────────────────────────────
    @Override
    public MessageResponse toggleComboActive(Long idCombo) {
        MessageResponse messageResponse = new MessageResponse();
        try {
            ComboEntity comboEntity = comboRepository.findById(idCombo).get();
            boolean newActive = !Boolean.TRUE.equals(comboEntity.getActive());
            comboEntity.setActive(newActive);
            comboEntity.setUpdatedAt(LocalDateTime.now());
            comboRepository.save(comboEntity);
            messageResponse.setMessage(newActive ? "Đã bật combo" : "Đã tắt combo");
            messageResponse.setStatus(HttpStatus.OK);
        } catch (NoSuchElementException ex) {
            messageResponse.setMessage("Không tìm thấy combo");
            messageResponse.setStatus(HttpStatus.NOT_FOUND);
        }
        return messageResponse;
    }

    // ── deleteComboImage ──────────────────────────────────────────────────
    @Override
    public MessageResponse deleteComboImage(Long idCombo, Long idComboImage) {
        MessageResponse messageResponse = new MessageResponse();
        return comboImageRepository
                .findByIdComboImageAndComboEntity_IdCombo(idComboImage, idCombo)
                .map(img -> {
                    comboImageRepository.delete(img);
                    messageResponse.setMessage("Xóa ảnh thành công");
                    messageResponse.setStatus(HttpStatus.OK);
                    return messageResponse;
                })
                .orElseGet(() -> {
                    messageResponse.setMessage("Không tìm thấy ảnh của combo");
                    messageResponse.setStatus(HttpStatus.NOT_FOUND);
                    return messageResponse;
                });
    }
}
