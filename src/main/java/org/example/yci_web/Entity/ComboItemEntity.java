package org.example.yci_web.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "combo_items")
public class ComboItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long idComboItem;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_combo")
    private ComboEntity comboEntity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_product")
    private ProductEntity productEntity;
}
