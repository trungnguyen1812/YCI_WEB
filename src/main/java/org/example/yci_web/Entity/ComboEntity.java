package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "combo")
public class ComboEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idCombo;

    @Column(name = "name_combo")
    private String nameCombo;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "discount_price")
    private Double discountPrice;

    @Column(name = "active", nullable = false, columnDefinition = "TINYINT(1) DEFAULT 1")
    private Boolean active = true;

    @Column(name = "created_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    @DateTimeFormat(pattern = "dd-MM-yyyy HH:mm:ss")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "comboEntity", fetch = FetchType.LAZY,
               cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ComboItemEntity> comboItemEntities = new ArrayList<>();

    @OneToMany(mappedBy = "comboEntity", fetch = FetchType.LAZY,
               cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ComboImageEntity> comboImageEntities = new ArrayList<>();
}
